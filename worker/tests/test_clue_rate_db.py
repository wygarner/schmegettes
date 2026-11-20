"""Rating against a real database. Runs only when DATABASE_OWNER_URL is set (local Supabase:
`mise run db:start`); CI's worker job has no database, so it skips there.

Everything happens in one transaction that is rolled back, so the local catalog is left as it was.
If the database is behind the migrations, point WORKER_TEST_SETUP_SQL at a file of the missing ones:
they are applied inside the same transaction and rolled back with it."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable, Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import TupleRow

from schmegettes_worker.clue_rate import BatchStatus, PgStore, Result, rate

OWNER_URL = os.environ.get("DATABASE_OWNER_URL")
SETUP_SQL = os.environ.get("WORKER_TEST_SETUP_SQL")
SEASON = 9998  # far from any real season; rolled back anyway

pytestmark = pytest.mark.skipif(not OWNER_URL, reason="DATABASE_OWNER_URL not set")


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[TupleRow]]:
    assert OWNER_URL
    with psycopg.connect(OWNER_URL) as c:  # not autocommit: one transaction, rolled back below
        try:
            if SETUP_SQL:
                c.execute(Path(SETUP_SQL).read_text("utf-8").encode())
            row = c.execute("select to_regclass('public.category_difficulty') is not null").fetchone()
            if not (row and row[0]):
                pytest.skip("the database has no public.category_difficulty: run the migrations")
            add_catalog(c)
            yield c
        finally:
            c.rollback()


def add_catalog(c: psycopg.Connection[TupleRow]) -> None:
    """Three whole board categories, one with only 4 clues (never rateable), and one Final."""
    rows = [
        ("single", f"RATE DB {name}", 200 * n, f"{name} clue {n}", f"{name} response {n}", f"rate-db-{name}-{n}")
        for name, count in (("A", 5), ("B", 5), ("C", 5), ("SHORT", 4))
        for n in range(1, count + 1)
    ] + [("final", "RATE DB FINAL", None, "final clue", "final response", "rate-db-final")]
    with c.cursor() as cur:
        cur.executemany(
            "insert into public.clues (season, air_date, round, category, value, clue_text, correct_response,"
            " source_key) values (%s, date '2020-01-01', %s, %s, %s, %s, %s, %s)",
            [(SEASON, *r) for r in rows],
        )


def key_of(c: psycopg.Connection[TupleRow], category: str) -> str:
    row = c.execute("select distinct category_key from public.clues where category = %s", (category,)).fetchone()
    assert row
    return str(row[0])


def hashed(key: str) -> int:
    return 1 + int(hashlib.md5(key.encode(), usedforsecurity=False).hexdigest(), 16) % 100


class FakeBatches:
    def __init__(self, fail: set[str] | None = None) -> None:
        self.messages: dict[str, str] = {}
        self.batches: dict[str, list[str]] = {}
        self.fail = fail or set()

    def submit(self, requests: list[tuple[str, str]]) -> str:
        batch_id = f"db-batch-{len(self.batches) + 1}"
        self.batches[batch_id] = [k for k, _ in requests]
        self.messages.update(requests)
        return batch_id

    def status(self, batch_id: str) -> BatchStatus:
        return "ended" if batch_id in self.batches else "missing"

    def results(self, batch_id: str) -> Iterable[Result]:
        for key in self.batches[batch_id]:
            yield Result(key, None, "errored") if key in self.fail else Result(key, hashed(key), None, 10, 2)


def row(c: psycopg.Connection[TupleRow], key: str) -> tuple[object, ...] | None:
    return c.execute(
        "select score, difficulty::text, batch_id, failures, model from public.category_difficulty"
        " where category_key = %s",
        (key,),
    ).fetchone()


def test_a_run_rates_whole_categories_then_labels_them_once(conn: psycopg.Connection[TupleRow]) -> None:
    store, client = PgStore(conn), FakeBatches()
    a, short, final = key_of(conn, "RATE DB A"), key_of(conn, "RATE DB SHORT"), key_of(conn, "RATE DB FINAL")

    report = rate(store, client, model="test-model", sleep=lambda _: None)
    assert report.counts["still_unrated"] == 0 and report.failed == 0
    assert set(report.scales) == {"board", "final"}

    # What reached Claude: the first 4 clues in board order with their responses, never the 5th.
    message = client.messages[a]
    assert message.splitlines()[0] == "Category: RATE DB A"
    assert "A clue 4" in message and "A response 4" in message and "A clue 5" not in message
    assert message.index("A clue 1") < message.index("A clue 2") < message.index("A clue 4")
    assert "Category: RATE DB FINAL" in client.messages[final]
    assert short not in client.messages and row(conn, short) is None  # 4 clues: can't reach a board

    labelled = row(conn, a)
    assert labelled is not None and labelled[0] == hashed(a) and labelled[1] in ("easy", "medium", "hard")
    assert labelled[2] is None and labelled[4] == "test-model"

    labels = conn.execute("select category_key, difficulty from public.category_difficulty").fetchall()
    scales = conn.execute("select * from public.difficulty_scale order by kind").fetchall()
    again = rate(store, client, model="test-model", sleep=lambda _: None)
    assert again.submitted == 0
    assert conn.execute("select category_key, difficulty from public.category_difficulty").fetchall() == labels
    assert conn.execute("select * from public.difficulty_scale order by kind").fetchall() == scales


def test_a_pending_batch_is_collected_not_resubmitted(conn: psycopg.Connection[TupleRow]) -> None:
    store, client = PgStore(conn), FakeBatches()
    todo = store.unrated(None)
    batch_id = client.submit([(c.key, "m") for c in todo])
    store.mark_submitted(todo, batch_id)
    assert store.pending_batches() == [batch_id]

    report = rate(store, client, model="m", sleep=lambda _: None)
    assert report.submitted == 0 and report.scored == len(todo)
    assert store.pending_batches() == []


def test_a_failure_is_counted_and_retried_next_run(conn: psycopg.Connection[TupleRow]) -> None:
    b = key_of(conn, "RATE DB B")
    store = PgStore(conn)
    first = rate(store, FakeBatches(fail={b}), model="m", sleep=lambda _: None)
    assert first.counts["failed"] == 1 and "board" in first.waiting
    assert row(conn, b) == (None, None, None, 1, None)

    second = rate(store, FakeBatches(), model="m", sleep=lambda _: None)
    assert second.submitted == 1 and second.counts["failed"] == 0 and "board" in second.scales
    scored = row(conn, b)
    assert scored is not None and scored[0] == hashed(b) and scored[1] is not None and scored[3] == 1


def test_two_failures_stop_holding_back_the_scale(conn: psycopg.Connection[TupleRow]) -> None:
    b = key_of(conn, "RATE DB B")
    store = PgStore(conn)
    rate(store, FakeBatches(fail={b}), model="m", sleep=lambda _: None)
    second = rate(store, FakeBatches(fail={b}), model="m", sleep=lambda _: None)
    assert "board" in second.scales and row(conn, b) == (None, None, None, 2, None)
    assert second.failure_names[b] == "RATE DB B (season 9998, single)"
    third = rate(store, FakeBatches(), model="m", sleep=lambda _: None)
    labelled = row(conn, b)
    assert third.submitted == 1 and labelled is not None and labelled[1] is not None


def test_samples_and_labels_for_the_quality_gate(conn: psycopg.Connection[TupleRow]) -> None:
    store = PgStore(conn)
    rate(store, FakeBatches(), model="m", sleep=lambda _: None)
    sample = store.sample(1000)
    assert sample and all(c.kind == "board" and len(c.clues) == 4 for c in sample)
    hard = store.sample(1000, "hard")
    assert all(store.labels([c.key])[c.key] == "hard" for c in hard)
    assert store.decades()  # every rated category falls in some decade
