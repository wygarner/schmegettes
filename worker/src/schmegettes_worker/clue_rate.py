"""Rating the catalog's categories Easy, Medium or Hard (`python -m schmegettes_worker rate-clues`).

Rules: docs/product-docs/features/clue-catalog/feature-brief.md ("Difficulty", "Rating (admin)").

Claude scores each category that can reach a board from 1 to 100, through the Message Batches API.
A run, safe to run again:

1. collect: results of batches an earlier run submitted (category_difficulty.batch_id is set);
2. submit: every rateable category without a score, in batches, recording the batch id *before*
   waiting, so an interrupted run picks the same batch up and nothing is paid for twice;
3. scale: once every rateable category of a kind has a score, the cut points that split the scores
   into thirds are written, once (difficulty_scale). A category that has failed GIVE_UP_AFTER times
   (one Claude keeps refusing, say) doesn't hold that back: it plays as Medium, as every unrated
   category does, and is still retried on every run;
4. label: every scored, unlabelled category gets its label from its kind's cut points. Labels are
   never changed.

Runs on the owner connection (DATABASE_OWNER_URL), like the catalog import. Only catalog text is
sent to Anthropic; nothing about players.
"""

from __future__ import annotations

import csv
import json
import math
import random
import time
import uuid
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Protocol

import anthropic
import psycopg
import structlog
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from psycopg import sql
from psycopg.rows import TupleRow

Kind = Literal["board", "final"]
Level = Literal["easy", "medium", "hard"]
KINDS: tuple[Kind, ...] = ("board", "final")
LEVELS: tuple[Level, ...] = ("easy", "medium", "hard")

DEFAULT_MODEL = "claude-haiku-5-5"
BATCH_SIZE = 10_000  # requests per batch; the API allows 100,000 or 256 MB, whichever comes first
POLL_S = 60
MAX_TOKENS = 2048
BOARD_ROWS = 4  # the clues that reach a board; the 5th (hardest) is never sent
GIVE_UP_AFTER = 2  # failures after which a category no longer holds back its kind's scale
SHOWN_FAILURES = 20  # failed categories named in a run's report and log

PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "category_difficulty.md"

# Batch prices per million tokens (input, output): half the standard rate. Used only for the
# estimate in the run's report; a model missing here is reported without one.
BATCH_PRICES: dict[str, tuple[float, float]] = {
    "claude-haiku-5-5": (0.05, 0.25),
    "claude-sonnet-5-5": (1.00, 5.00),
    "claude-opus-5-5": (2.00, 10.00),
}

# The 1-100 range is checked in parse_score: structured outputs don't enforce numeric bounds.
SCORE_SCHEMA = {
    "type": "object",
    "properties": {"score": {"type": "integer"}},
    "required": ["score"],
    "additionalProperties": False,
}

log = structlog.get_logger(service="worker")


@dataclass(frozen=True)
class Category:
    key: str
    kind: Kind
    name: str
    season: int
    clues: tuple[tuple[str, str], ...]  # (clue, correct response), in board order


@dataclass(frozen=True)
class Result:
    custom_id: str
    score: int | None  # None on any failure
    failure: str | None = None  # errored, expired, canceled, refusal, max_tokens, invalid
    input_tokens: int = 0
    output_tokens: int = 0


BatchStatus = Literal["in_progress", "ended", "missing"]


class BatchClient(Protocol):
    def submit(self, requests: list[tuple[str, str]]) -> str:
        """Submit (custom_id, user message) pairs as one batch; return its id."""
        ...

    def status(self, batch_id: str) -> BatchStatus: ...

    def results(self, batch_id: str) -> Iterable[Result]: ...


class Store(Protocol):
    def pending_batches(self) -> list[str]: ...

    def unrated(self, limit: int | None, skip: set[str] | None = None) -> list[Category]:
        """Rateable categories without a score or a pending request, except those in `skip`."""
        ...

    def mark_submitted(self, categories: list[Category], batch_id: str) -> None: ...

    def record(self, batch_id: str, results: list[Result], model: str) -> tuple[int, int]:
        """Save one batch's results: (scored, failed). Rows of the batch with no result fail."""
        ...

    def scale(self, kind: Kind) -> tuple[int, int] | None: ...

    def unscored(self, kind: Kind) -> int:
        """Rateable categories of this kind with no score that would still hold back its scale:
        those that have failed fewer than GIVE_UP_AFTER times."""
        ...

    def names(self, keys: list[str]) -> dict[str, str]:
        """category_key -> "NAME (season N, round)", for the report."""
        ...

    def scores(self, kind: Kind) -> list[int]: ...

    def set_scale(self, kind: Kind, easy_max: int, medium_max: int, categories: int) -> None: ...

    def label(self, kind: Kind, easy_max: int, medium_max: int) -> int: ...

    def counts(self) -> dict[str, int]:
        """easy, medium, hard, unlabelled (scored, waiting for a scale), failed, still_unrated."""
        ...

    def decades(self) -> dict[str, Counter[str]]: ...

    def clear_labels(self) -> None:
        """Forget every label and both scales, keeping the scores (a deliberate recut)."""
        ...


# ---------------------------------------------------------------------------
# Requests and results
# ---------------------------------------------------------------------------


def category_message(c: Category) -> str:
    lines = [f"Category: {c.name}"]
    for i, (clue, response) in enumerate(c.clues, start=1):
        lines.append(f"Clue {i}: {clue}")
        lines.append(f"Response {i}: {response}")
    return "\n".join(lines)


def clue_message(category: str, clue: str, response: str) -> str:
    return f"Score this single clue alone.\nCategory: {category}\nClue: {clue}\nResponse: {response}"


def request_params(model: str, system: str, message: str) -> MessageCreateParamsNonStreaming:
    """One request's params. Thinking is left at the model's default (it can't be turned off on
    current models); low effort keeps it short. Batches can't carry `fallbacks`, so a refusal is
    a failure and the category is retried on the next run."""
    return {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": message}],
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCORE_SCHEMA}},
    }


def parse_score(stop_reason: str | None, texts: list[str]) -> tuple[int | None, str | None]:
    """(score, None) for a usable reply, else (None, why)."""
    if stop_reason == "refusal":
        return None, "refusal"
    if stop_reason == "max_tokens":
        return None, "max_tokens"
    try:
        value = json.loads(texts[0])["score"] if texts else None
    except (ValueError, KeyError, TypeError):
        return None, "invalid"
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 100:
        return None, "invalid"
    return value, None


class AnthropicBatches:
    """BatchClient over the Anthropic SDK's Message Batches API."""

    def __init__(self, client: anthropic.Anthropic, model: str, system: str) -> None:
        self._client = client
        self._model = model
        self._system = system

    def submit(self, requests: list[tuple[str, str]]) -> str:
        batch = self._client.messages.batches.create(
            requests=[
                Request(custom_id=custom_id, params=request_params(self._model, self._system, message))
                for custom_id, message in requests
            ]
        )
        return str(batch.id)

    def status(self, batch_id: str) -> BatchStatus:
        try:
            batch = self._client.messages.batches.retrieve(batch_id)
        except anthropic.NotFoundError:
            return "missing"
        return "ended" if batch.processing_status == "ended" else "in_progress"

    def results(self, batch_id: str) -> Iterator[Result]:
        for entry in self._client.messages.batches.results(batch_id):
            result = entry.result
            if result.type != "succeeded":
                yield Result(entry.custom_id, None, result.type)
                continue
            message = result.message
            texts = [b.text for b in message.content if b.type == "text"]
            score, failure = parse_score(message.stop_reason, texts)
            yield Result(
                entry.custom_id, score, failure, message.usage.input_tokens or 0, message.usage.output_tokens or 0
            )


# ---------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------


@dataclass
class RunReport:
    submitted: int = 0
    scored: int = 0
    failed: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    scales: dict[str, tuple[int, int]] = field(default_factory=dict)
    waiting: dict[str, int] = field(default_factory=dict)  # kind -> unscored, when no scale yet
    counts: dict[str, int] = field(default_factory=dict)
    decades: dict[str, Counter[str]] = field(default_factory=dict)
    failures: list[tuple[str, str]] = field(default_factory=list)  # (category_key, why) this run
    failure_names: dict[str, str] = field(default_factory=dict)


def cut_points(scores: list[int]) -> tuple[int, int]:
    """The cut points: score <= easy_max is easy, <= medium_max is medium, above is hard.

    Scores bunch up, so many categories can share the score at a third. Labels come from the score
    alone, so a tied score can't be split: each cut goes just above the tied score or just below
    it, whichever brings that level's share nearer a third (on an exact tie, the lower cut).
    """
    if not scores:
        raise ValueError("no scores to cut")
    counts = Counter(scores)
    n = len(scores)
    # (score, how many categories score at or below it), lowest score first.
    at_or_below: list[tuple[int, int]] = []
    running = 0
    for score in sorted(counts):
        running += counts[score]
        at_or_below.append((score, running))

    def nearest(target: float, floor: int) -> int:
        candidates = [(abs(k - target), score) for score, k in at_or_below if score >= floor]
        return min(candidates)[1]

    easy_max = nearest(n / 3, at_or_below[0][0])
    return easy_max, nearest(2 * n / 3, easy_max)


def level(score: int, easy_max: int, medium_max: int) -> Level:
    if score <= easy_max:
        return "easy"
    return "medium" if score <= medium_max else "hard"


def wait_and_collect(
    store: Store,
    client: BatchClient,
    batch_id: str,
    model: str,
    report: RunReport,
    run_id: str,
    sleep: Callable[[float], None],
) -> None:
    while (status := client.status(batch_id)) == "in_progress":
        sleep(POLL_S)
    results = [] if status == "missing" else list(client.results(batch_id))
    scored, failed = store.record(batch_id, results, model)
    tokens_in = sum(r.input_tokens for r in results)
    tokens_out = sum(r.output_tokens for r in results)
    report.scored += scored
    report.failed += failed
    report.input_tokens += tokens_in
    report.output_tokens += tokens_out
    log.info(
        "difficulty batch collected",
        run_id=run_id,
        batch_id=batch_id,
        succeeded=scored,
        failed=failed,
        missing=status == "missing",
        input_tokens=tokens_in,
        output_tokens=tokens_out,
    )
    failures = [(r.custom_id, r.failure) for r in results if r.failure]
    report.failures += failures
    if failures:
        # One summary line per batch, not one per category (logging-conventions.md).
        log.info(
            "difficulty ratings failed",
            run_id=run_id,
            batch_id=batch_id,
            failures=[{"category_key": k, "result": why} for k, why in failures[:SHOWN_FAILURES]],
        )


def rate(
    store: Store,
    client: BatchClient,
    *,
    model: str,
    limit: int | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> RunReport:
    run_id = str(uuid.uuid4())
    report = RunReport()

    for batch_id in store.pending_batches():
        wait_and_collect(store, client, batch_id, model, report, run_id, sleep)

    remaining = limit
    tried: set[str] = set()
    while remaining is None or remaining > 0:
        size = BATCH_SIZE if remaining is None else min(BATCH_SIZE, remaining)
        # A category is submitted at most once per run: one that fails waits for the next run,
        # so a reply that always fails (a refusal) can't loop.
        todo = store.unrated(size, tried)
        if not todo:
            break
        batch_id = client.submit([(c.key, category_message(c)) for c in todo])
        store.mark_submitted(todo, batch_id)
        tried.update(c.key for c in todo)
        report.submitted += len(todo)
        log.info("difficulty batch submitted", run_id=run_id, batch_id=batch_id, requests=len(todo))
        wait_and_collect(store, client, batch_id, model, report, run_id, sleep)
        if remaining is not None:
            remaining -= len(todo)

    for kind in KINDS:
        scale = store.scale(kind)
        if scale is None:
            unscored = store.unscored(kind)
            scores = store.scores(kind)
            if unscored or not scores:
                report.waiting[kind] = unscored
                continue
            scale = cut_points(scores)
            store.set_scale(kind, scale[0], scale[1], len(scores))
            log.info(
                "difficulty scale set",
                run_id=run_id,
                kind=kind,
                easy_max=scale[0],
                medium_max=scale[1],
                categories=len(scores),
            )
        report.scales[kind] = scale
        store.label(kind, *scale)

    report.counts = store.counts()
    report.decades = store.decades()
    report.failure_names = store.names([k for k, _ in report.failures[:SHOWN_FAILURES]])
    log.info("difficulty run finished", run_id=run_id, model=model, submitted=report.submitted, **report.counts)
    return report


def recut(store: Store, client: BatchClient, *, model: str) -> RunReport:
    """Labels are meant never to change; this is the deliberate exception, after the cut rule
    changes. It clears the scales and labels, then sets them again from the stored scores. Nothing
    is sent to Claude, beyond collecting a batch an earlier run left pending."""
    store.clear_labels()
    log.info("difficulty labels cleared for a recut")
    return rate(store, client, model=model, limit=0)


def estimated_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    prices = BATCH_PRICES.get(model)
    if prices is None:
        return None
    return input_tokens / 1e6 * prices[0] + output_tokens / 1e6 * prices[1]


def render_report(report: RunReport, model: str) -> str:
    """The summary the admin reads (clue-catalog interaction design, "Rating the catalog")."""
    c = report.counts
    cols = ("rated", "easy", "medium", "hard", "failed", "still unrated")
    values = (
        report.scored,
        c.get("easy", 0),
        c.get("medium", 0),
        c.get("hard", 0),
        c.get("failed", 0),
        c.get("still_unrated", 0),
    )
    cells = [f"{v:,}" for v in values]
    widths = [max(len(h), len(v)) for h, v in zip(cols, cells, strict=True)]
    lines = [
        "  ".join(h.ljust(w) for h, w in zip(cols, widths, strict=True)).rstrip(),
        "  ".join(v.ljust(w) for v, w in zip(cells, widths, strict=True)).rstrip(),
        "",
    ]
    for kind in KINDS:
        if kind in report.scales:
            e, m = report.scales[kind]
            lines.append(f"{kind} scale: easy <= {e}, medium <= {m}, hard above")
        elif kind in report.waiting:
            lines.append(f"{kind} scale waits for {report.waiting[kind]:,} unrated")
    if c.get("unlabelled"):
        lines.append(f"scored, waiting for a scale: {c['unlabelled']:,}")
    if report.failures:
        lines.append("")
        lines.append(
            f"failed this run (retried next run; after {GIVE_UP_AFTER} failures one no longer holds back"
            " a scale and plays as Medium):"
        )
        for key, why in report.failures[:SHOWN_FAILURES]:
            lines.append(f"  {report.failure_names.get(key, key)}: {why}")
        if len(report.failures) > SHOWN_FAILURES:
            lines.append(f"  ... and {len(report.failures) - SHOWN_FAILURES:,} more")
    if report.decades:
        lines.append("")
        lines.append("labels by season          easy  medium    hard")
        for decade, counter in report.decades.items():
            total = sum(counter.values()) or 1
            shares = "  ".join(f"{100 * counter.get(lv, 0) / total:5.1f}%" for lv in LEVELS)
            lines.append(f"  seasons {decade:<10}  {shares}")
    lines.append("")
    tokens = f"tokens: {report.input_tokens:,} in, {report.output_tokens:,} out ({model})"
    cost = estimated_cost(model, report.input_tokens, report.output_tokens)
    lines.append(tokens + (f", about ${cost:,.2f} at batch prices" if cost is not None else ""))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Quality gate (product brief, "Quality gate")
# ---------------------------------------------------------------------------


@dataclass
class OrderCheck:
    categories: int
    rising: int  # categories whose per-clue scores rise from row 1 to row 4 (slope > 0)
    row_means: list[float]

    @property
    def passed(self) -> bool:
        means = self.row_means
        return self.categories > 0 and means[-1] > means[0] and self.rising >= math.ceil(0.7 * self.categories)


def slope(values: list[int]) -> float:
    n = len(values)
    mean_x = (n - 1) / 2
    mean_y = sum(values) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in enumerate(values))
    den = sum((x - mean_x) ** 2 for x in range(n))
    return num / den if den else 0.0


def check_order(
    categories: list[Category], client: BatchClient, sleep: Callable[[float], None] = time.sleep
) -> OrderCheck:
    """Score each board clue of these categories on its own; the scores should climb with the rows."""
    requests = [
        (f"{c.key}-{row}", clue_message(c.name, clue, response))
        for c in categories
        for row, (clue, response) in enumerate(c.clues)
    ]
    batch_id = client.submit(requests)
    log.info("difficulty order check submitted", batch_id=batch_id, requests=len(requests))
    while (status := client.status(batch_id)) == "in_progress":
        sleep(POLL_S)
    scores: dict[str, dict[int, int]] = defaultdict(dict)
    for r in [] if status == "missing" else client.results(batch_id):
        key, _, row = r.custom_id.rpartition("-")
        if r.score is not None:
            scores[key][int(row)] = r.score
    complete = [[s[row] for row in range(BOARD_ROWS)] for s in scores.values() if len(s) == BOARD_ROWS]
    means = [sum(v[row] for v in complete) / len(complete) if complete else 0.0 for row in range(BOARD_ROWS)]
    return OrderCheck(len(complete), sum(slope(v) > 0 for v in complete), means)


def render_order_check(check: OrderCheck) -> str:
    means = "  ".join(f"row {i + 1}: {m:.1f}" for i, m in enumerate(check.row_means))
    share = 100 * check.rising / check.categories if check.categories else 0.0
    return (
        f"categories checked: {check.categories}\n"
        f"mean score by row: {means}\n"
        f"rising from row 1 to row 4: {check.rising} ({share:.0f}%; 70% needed)\n"
        f"{'PASS' if check.passed else 'FAIL'}"
    )


HANDCHECK_COLUMNS = ("category_key", "category", "clues", "my_label")


def write_handcheck(categories: list[Category], path: Path) -> None:
    """The hand-check sheet: Claude's label is left out on purpose."""
    rows = list(categories)
    random.shuffle(rows)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HANDCHECK_COLUMNS)
        for c in rows:
            clues = " | ".join(f"{clue} -> {response}" for clue, response in c.clues)
            w.writerow((c.key, c.name, clues, ""))


def read_handcheck(path: Path) -> dict[str, Level]:
    """category_key -> the hand label. Accepts easy/medium/hard or e/m/h, any case."""
    accepted: dict[str, Level] = {
        "easy": "easy",
        "medium": "medium",
        "hard": "hard",
        "e": "easy",
        "m": "medium",
        "h": "hard",
    }
    labels: dict[str, Level] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw = (row.get("my_label") or "").strip().lower()
            if raw not in accepted:
                raise ValueError(f"my_label for {row.get('category')!r} must be easy, medium or hard, not {raw!r}")
            labels[row["category_key"]] = accepted[raw]
    return labels


@dataclass
class HandCheck:
    agree: int
    total: int
    confusion: dict[tuple[Level, Level], int]  # (hand, Claude) -> count

    @property
    def passed(self) -> bool:
        return self.total == 60 and self.agree >= 45


def score_handcheck(hand: dict[str, Level], claude: dict[str, Level]) -> HandCheck:
    missing = sorted(set(hand) - set(claude))
    if missing:
        raise ValueError(f"{len(missing)} categories in the sheet have no label in this database")
    confusion: Counter[tuple[Level, Level]] = Counter((hand[k], claude[k]) for k in hand)
    agree = sum(n for (h, c), n in confusion.items() if h == c)
    return HandCheck(agree, len(hand), dict(confusion))


def render_handcheck(check: HandCheck) -> str:
    lines = [f"agree: {check.agree} of {check.total} (45 of 60 needed)", "", "you \\ Claude   easy  medium    hard"]
    for h in LEVELS:
        lines.append(f"{h:<14}" + "".join(f"{check.confusion.get((h, c), 0):>7} " for c in LEVELS))
    lines += ["", "PASS" if check.passed else "FAIL"]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Postgres
# ---------------------------------------------------------------------------

# Categories that can reach a board: exactly 5 clues for Single and Double, 1 for Final (the same
# rule as public.build_board_round).
_RATEABLE = sql.SQL("""
  select c.category_key,
         case when min(c.round::text) = 'final' then 'final' else 'board' end as kind,
         min(c.category) as name, min(c.season) as season
  from public.clues c
  group by c.category_key
  having count(*) = case when min(c.round::text) = 'final' then 1 else 5 end
""")


class PgStore:
    """category_difficulty and difficulty_scale on the owner connection."""

    def __init__(self, conn: psycopg.Connection[TupleRow]) -> None:
        self._conn = conn

    def pending_batches(self) -> list[str]:
        rows = self._conn.execute(
            "select distinct batch_id from public.category_difficulty"
            " where batch_id is not null and score is null order by batch_id"
        ).fetchall()
        return [r[0] for r in rows]

    def _with_clues(self, rows: list[tuple[str, str, str, int]]) -> list[Category]:
        keys = [r[0] for r in rows]
        clues: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for key, clue, response in self._conn.execute(
            "select category_key, clue_text, correct_response from ("
            "  select category_key, clue_text, correct_response,"
            "    row_number() over (partition by category_key order by value nulls last, id) as rn"
            "  from public.clues where category_key = any(%s)"
            ") c where rn <= %s order by category_key, rn",
            (keys, BOARD_ROWS),
        ).fetchall():
            clues[key].append((clue, response))
        return [
            Category(k, "final" if kind == "final" else "board", name, season, tuple(clues[k]))
            for k, kind, name, season in rows
        ]

    def unrated(self, limit: int | None, skip: set[str] | None = None) -> list[Category]:
        rows = self._conn.execute(
            sql.SQL(
                "with rateable as ({})"
                " select r.category_key, r.kind, r.name, r.season from rateable r"
                " left join public.category_difficulty d on d.category_key = r.category_key"
                " where (d.category_key is null or (d.score is null and d.batch_id is null))"
                "   and not (r.category_key = any(%s))"
                " order by r.category_key limit %s"
            ).format(_RATEABLE),
            (sorted(skip or ()), limit),
        ).fetchall()
        return self._with_clues(rows)

    def mark_submitted(self, categories: list[Category], batch_id: str) -> None:
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.executemany(
                "insert into public.category_difficulty (category_key, kind, batch_id) values (%s, %s, %s)"
                " on conflict (category_key) do update set batch_id = excluded.batch_id",
                [(c.key, c.kind, batch_id) for c in categories],
            )

    def record(self, batch_id: str, results: list[Result], model: str) -> tuple[int, int]:
        good = [(r.score, model, r.custom_id) for r in results if r.score is not None]
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.executemany(
                "update public.category_difficulty set score = %s, model = %s, rated_at = now(), batch_id = null"
                " where category_key = %s and batch_id = %s and score is null",
                [(*g, batch_id) for g in good],
            )
            # Everything else of this batch failed: an error, a refusal, a bad reply, or no result.
            cur.execute(
                "update public.category_difficulty set batch_id = null, failures = failures + 1"
                " where batch_id = %s and score is null",
                (batch_id,),
            )
            failed = cur.rowcount
        return len(good), failed

    def scale(self, kind: Kind) -> tuple[int, int] | None:
        row = self._conn.execute(
            "select easy_max, medium_max from public.difficulty_scale where kind = %s", (kind,)
        ).fetchone()
        return (row[0], row[1]) if row else None

    def unscored(self, kind: Kind) -> int:
        row = self._conn.execute(
            sql.SQL(
                "with rateable as ({})"
                " select count(*) from rateable r"
                " left join public.category_difficulty d on d.category_key = r.category_key"
                " where r.kind = %s and d.score is null and coalesce(d.failures, 0) < %s"
            ).format(_RATEABLE),
            (kind, GIVE_UP_AFTER),
        ).fetchone()
        return int(row[0]) if row else 0

    def names(self, keys: list[str]) -> dict[str, str]:
        rows = self._conn.execute(
            "select category_key, min(category), min(season), min(round::text) from public.clues"
            " where category_key = any(%s) group by category_key",
            (keys,),
        ).fetchall()
        return {k: f"{name} (season {season}, {round_})" for k, name, season, round_ in rows}

    def scores(self, kind: Kind) -> list[int]:
        rows = self._conn.execute(
            "select score from public.category_difficulty where kind = %s and score is not null", (kind,)
        ).fetchall()
        return [r[0] for r in rows]

    def set_scale(self, kind: Kind, easy_max: int, medium_max: int, categories: int) -> None:
        self._conn.execute(
            "insert into public.difficulty_scale (kind, easy_max, medium_max, categories) values (%s, %s, %s, %s)"
            " on conflict (kind) do nothing",
            (kind, easy_max, medium_max, categories),
        )

    def label(self, kind: Kind, easy_max: int, medium_max: int) -> int:
        cur = self._conn.execute(
            "update public.category_difficulty set difficulty = case"
            "   when score <= %s then 'easy' when score <= %s then 'medium' else 'hard' end::public.difficulty"
            " where kind = %s and score is not null and difficulty is null",
            (easy_max, medium_max, kind),
        )
        return cur.rowcount

    def counts(self) -> dict[str, int]:
        row = self._conn.execute(
            sql.SQL(
                "with rateable as ({})"
                " select count(*) filter (where d.difficulty = 'easy'),"
                "   count(*) filter (where d.difficulty = 'medium'),"
                "   count(*) filter (where d.difficulty = 'hard'),"
                "   count(*) filter (where d.score is not null and d.difficulty is null),"
                "   count(*) filter (where d.score is null and d.failures > 0),"
                "   count(*) filter (where d.score is null)"
                " from rateable r left join public.category_difficulty d on d.category_key = r.category_key"
            ).format(_RATEABLE)
        ).fetchone()
        assert row is not None
        return dict(
            zip(("easy", "medium", "hard", "unlabelled", "failed", "still_unrated"), map(int, row), strict=True)
        )

    def decades(self) -> dict[str, Counter[str]]:
        out: dict[str, Counter[str]] = {}
        for decade, difficulty, n in self._conn.execute(
            sql.SQL(
                "with rateable as ({})"
                " select ((r.season - 1) / 10) * 10 + 1 as decade, d.difficulty::text, count(*)"
                " from rateable r join public.category_difficulty d on d.category_key = r.category_key"
                " where d.difficulty is not null group by 1, 2 order by 1, 2"
            ).format(_RATEABLE)
        ).fetchall():
            out.setdefault(f"{decade}-{decade + 9}", Counter())[difficulty] = n
        return out

    def clear_labels(self) -> None:
        with self._conn.transaction():
            self._conn.execute("delete from public.difficulty_scale")
            self._conn.execute("update public.category_difficulty set difficulty = null where difficulty is not null")

    def sample(self, n: int, only: Level | None = None) -> list[Category]:
        """Random labelled board categories (a level, or any), for the quality gate."""
        rows = self._conn.execute(
            sql.SQL(
                "with rateable as ({})"
                " select r.category_key, r.kind, r.name, r.season from rateable r"
                " join public.category_difficulty d on d.category_key = r.category_key"
                " where r.kind = 'board' and d.difficulty is not null and (%s::public.difficulty is null"
                "   or d.difficulty = %s::public.difficulty)"
                " order by random() limit %s"
            ).format(_RATEABLE),
            (only, only, n),
        ).fetchall()
        return self._with_clues(rows)

    def labels(self, keys: list[str]) -> dict[str, Level]:
        rows = self._conn.execute(
            "select category_key, difficulty::text from public.category_difficulty"
            " where category_key = any(%s) and difficulty is not null",
            (keys,),
        ).fetchall()
        return {k: v for k, v in rows if v in LEVELS}
