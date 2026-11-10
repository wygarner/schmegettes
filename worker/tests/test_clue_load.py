import pytest

from schmegettes_worker.clue_import import CatalogClue
from schmegettes_worker.clue_load import (
    PrivateAccessNotLive,
    http_fetch,
    load_seasons,
    parse_seasons,
    render_summary,
)
from tests.test_clue_import import HEADER, category


class FakeStore:
    def __init__(self, *, private_access: bool = True, fail_on: int | None = None) -> None:
        self.private_access = private_access
        self.fail_on = fail_on
        self.keys: set[str] = set()
        self.stats_refreshed = 0

    def refresh_stats(self) -> None:
        self.stats_refreshed += 1

    def private_access_live(self) -> bool:
        return self.private_access

    def save(self, clues: list[CatalogClue]) -> int:
        if clues and clues[0].season == self.fail_on:
            raise RuntimeError("connection reset")
        new = {c.source_key for c in clues} - self.keys
        self.keys |= new
        return len(new)


def fetch_ok(season: int) -> str:
    return HEADER + category(f"SEASON {season}") + category("NOTE", comment="(note)")


def test_parse_seasons() -> None:
    assert parse_seasons("1-5,12") == [1, 2, 3, 4, 5, 12]
    assert parse_seasons("3, 1-2,2") == [1, 2, 3]
    for bad in ["", "0", "5-1", "a", "1-"]:
        with pytest.raises(ValueError):
            parse_seasons(bad)


def test_loads_and_a_rerun_inserts_nothing() -> None:
    store = FakeStore()
    first = load_seasons([1, 2], fetch=fetch_ok, store=store, env="local")
    assert [r.inserted for r in first] == [5, 5]
    assert all(r.report and r.report.left_out["host_note"] == 1 for r in first)
    again = load_seasons([1, 2], fetch=fetch_ok, store=store, env="local")
    assert [r.inserted for r in again] == [0, 0]
    assert all(r.ok for r in again)
    assert store.stats_refreshed == 1  # only after the run that inserted rows


def test_a_failing_season_does_not_stop_the_others() -> None:
    def fetch(season: int) -> str:
        if season == 2:
            raise TimeoutError
        return fetch_ok(season)

    results = load_seasons([1, 2, 3, 4], fetch=fetch, store=FakeStore(fail_on=4), env="local")
    assert [r.ok for r in results] == [True, False, True, False]
    assert results[1].failed_stage == "download"
    assert results[1].reason == "download timed out"
    assert results[3].failed_stage == "store"
    summary = render_summary(results)
    assert "failed: season 2 (download timed out)" in summary
    assert "failed: season 4 (connection reset)" in summary


def test_production_needs_private_access() -> None:
    with pytest.raises(PrivateAccessNotLive):
        load_seasons([1], fetch=fetch_ok, store=FakeStore(private_access=False), env="production")
    # Local and staging are not guarded.
    assert load_seasons([1], fetch=fetch_ok, store=FakeStore(private_access=False), env="staging")[0].ok


def test_summary_has_a_row_per_season_and_a_total() -> None:
    summary = render_summary(load_seasons([1, 2], fetch=fetch_ok, store=FakeStore(), env="local"))
    lines = summary.splitlines()
    assert lines[0].split()[:3] == ["season", "clues", "read"]
    assert lines[1].split()[:4] == ["1", "10", "5", "1"]
    assert lines[-1].split()[:4] == ["total", "20", "10", "2"]


def test_fetch_needs_https() -> None:
    with pytest.raises(ValueError):
        http_fetch("http://example.com/seasons")
