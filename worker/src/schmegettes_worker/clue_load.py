"""Loading season files into public.clues (`python -m schmegettes_worker import-clues`).

One season is one transaction: download, keep the categories that pass the content rules,
then insert with `on conflict (source_key) do nothing`. Running a season again inserts
nothing, so clue ids, and the seen-clue history that points at them, never change. A failed
season doesn't stop the others; running again finishes the job.

Runs on the owner connection (DATABASE_OWNER_URL), the one place catalog writes are allowed
(docs/system-docs/architecture/data-and-isolation.md).
"""

from __future__ import annotations

import re
import time
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol

import psycopg
import structlog
from psycopg.rows import TupleRow

from .clue_import import RULES, CatalogClue, SeasonReport, parse_season_tsv, select_categories

DEFAULT_SEASONS = "1-40"
FETCH_TIMEOUT_S = 60
FETCH_ATTEMPTS = 3

Stage = Literal["download", "store"]
Fetch = Callable[[int], str]

log = structlog.get_logger(service="worker")


class Store(Protocol):
    def private_access_live(self) -> bool: ...

    def save(self, clues: list[CatalogClue]) -> int:
        """Insert the clues in one transaction and return how many were new."""
        ...

    def refresh_stats(self) -> None:
        """Update planner statistics, so the first board after a big load is built quickly."""
        ...


@dataclass
class SeasonResult:
    season: int
    report: SeasonReport | None = None
    inserted: int = 0
    failed_stage: Stage | None = None
    reason: str = ""

    @property
    def ok(self) -> bool:
        return self.failed_stage is None


class PrivateAccessNotLive(Exception):
    """Production may hold the catalog only once hosting is invite-only."""


def parse_seasons(spec: str) -> list[int]:
    """'1-5,12' -> [1, 2, 3, 4, 5, 12]. Raises ValueError on anything else."""
    seasons: set[int] = set()
    for part in spec.replace(" ", "").split(","):
        match = re.fullmatch(r"(\d+)(?:-(\d+))?", part)
        if not match:
            raise ValueError(f"not a season or range: {part!r}")
        first = int(match.group(1))
        last = int(match.group(2) or first)
        if first < 1 or last < first:
            raise ValueError(f"not a valid range: {part!r}")
        seasons.update(range(first, last + 1))
    return sorted(seasons)


def http_fetch(base_url: str) -> Fetch:
    """Downloads `{base_url}/season{N}.tsv`, retrying twice."""
    if not base_url.startswith("https://"):
        raise ValueError("CLUE_DATASET_BASE_URL must be an https URL")

    def fetch(season: int) -> str:
        url = f"{base_url.rstrip('/')}/season{season}.tsv"
        for attempt in range(1, FETCH_ATTEMPTS + 1):
            try:
                with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_S) as response:  # noqa: S310 (https checked above)
                    body: bytes = response.read()
                    return body.decode("utf-8")
            except OSError:
                if attempt == FETCH_ATTEMPTS:
                    raise
                time.sleep(2 * attempt)
        raise AssertionError("unreachable")

    return fetch


def load_seasons(
    seasons: list[int], *, fetch: Fetch, store: Store, env: str, now: Callable[[], float] = time.monotonic
) -> list[SeasonResult]:
    if env == "production" and not store.private_access_live():
        raise PrivateAccessNotLive

    started = now()
    log.info("clue import started", seasons=len(seasons), env=env)
    results = [_load_one(season, fetch, store, now) for season in seasons]
    if any(r.inserted for r in results):
        store.refresh_stats()
    log.info(
        "clue import finished",
        seasons_loaded=sum(r.ok for r in results),
        seasons_failed=sum(not r.ok for r in results),
        inserted=sum(r.inserted for r in results),
        duration_ms=round((now() - started) * 1000),
    )
    return results


def _load_one(season: int, fetch: Fetch, store: Store, now: Callable[[], float]) -> SeasonResult:
    started = now()
    result = SeasonResult(season=season)
    try:
        text = fetch(season)
    except Exception as err:  # one season's failure must not stop the run
        log.error("season import failed", season=season, stage="download", err=repr(err))
        result.failed_stage, result.reason = "download", _reason(err)
        return result

    kept, result.report = select_categories(season, parse_season_tsv(season, text))
    try:
        result.inserted = store.save(kept)
    except Exception as err:
        log.error("season import failed", season=season, stage="store", err=repr(err))
        result.failed_stage, result.reason = "store", _reason(err)
        return result

    log.info(
        "season imported",
        season=season,
        clues_read=result.report.clues_read,
        inserted=result.inserted,
        categories_kept=result.report.categories_kept,
        left_out=result.report.left_out,
        duration_ms=round((now() - started) * 1000),
    )
    return result


def _reason(err: Exception) -> str:
    if isinstance(err, TimeoutError):
        return "download timed out"
    text = str(err).splitlines()[0] if str(err) else type(err).__name__
    return text[:120]


_COLUMNS = ("season", "clues read", "new clues", "categories kept", *(r.replace("_", " ") for r in RULES))


def render_summary(results: list[SeasonResult]) -> str:
    """The table the admin reads at the end of a run (interaction-design.md, "A run")."""
    rows: list[tuple[str, ...]] = []
    totals = [0] * (len(_COLUMNS) - 1)
    for r in results:
        if r.report is None:
            continue
        values = [r.report.clues_read, r.inserted, r.report.categories_kept, *(r.report.left_out[k] for k in RULES)]
        totals = [t + v for t, v in zip(totals, values, strict=True)]
        rows.append((str(r.season), *(f"{v:,}" for v in values)))
    rows.append(("total", *(f"{v:,}" for v in totals)))

    widths = [max(len(c), *(len(row[i]) for row in rows)) for i, c in enumerate(_COLUMNS)]
    lines = ["  ".join(c.rjust(w) for c, w in zip(_COLUMNS, widths, strict=True))]
    lines += ["  ".join(v.rjust(w) for v, w in zip(row, widths, strict=True)) for row in rows]
    lines += [f"failed: season {r.season} ({r.reason}) - run again to finish" for r in results if not r.ok]
    return "\n".join(lines)


class PgStore:
    """Writes on the owner connection. One transaction per `save`."""

    def __init__(self, conn: psycopg.Connection[TupleRow]) -> None:
        self._conn = conn

    def private_access_live(self) -> bool:
        row = self._conn.execute("select to_regclass('public.hosts') is not null").fetchone()
        return bool(row and row[0])

    def refresh_stats(self) -> None:
        self._conn.execute("analyze public.clues")

    def save(self, clues: list[CatalogClue]) -> int:
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "create temp table incoming (season integer, air_date date, round public.round, category text,"
                " value integer, clue_text text, correct_response text, source_key text) on commit drop"
            )
            with cur.copy(
                "copy incoming (season, air_date, round, category, value, clue_text, correct_response, source_key)"
                " from stdin"
            ) as copy:
                for c in clues:
                    copy.write_row(
                        (
                            c.season,
                            c.air_date,
                            c.round,
                            c.category,
                            c.value,
                            c.clue_text,
                            c.correct_response,
                            c.source_key,
                        )
                    )
            cur.execute(
                "insert into public.clues (season, air_date, round, category, value, clue_text, correct_response,"
                " source_key) select season, air_date, round, category, value, clue_text, correct_response, source_key"
                " from incoming on conflict (source_key) do nothing"
            )
            return cur.rowcount
