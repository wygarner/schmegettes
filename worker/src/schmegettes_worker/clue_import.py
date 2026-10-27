"""Parsing for the jeopardy_clue_dataset season TSVs (github.com/wygarner/jeopardy_clue_dataset).

Each row becomes a catalog clue. `source_key` is stable across re-imports, so the import
upserts on it and running the same season twice changes nothing.
"""

from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass

ROUNDS = {"1": "single", "2": "double", "3": "final"}


@dataclass(frozen=True)
class CatalogClue:
    season: int
    air_date: str | None
    round: str
    category: str
    value: int | None
    clue_text: str
    correct_response: str
    source_key: str


def parse_season_tsv(season: int, text: str) -> list[CatalogClue]:
    """Parse one season's TSV. Rows missing a clue or response are skipped."""
    clues: list[CatalogClue] = []
    for row in csv.DictReader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE):
        clue_text = _clean(row.get("answer"))  # the dataset names the clue "answer"
        response = _clean(row.get("question"))  # and the response "question"
        round_name = ROUNDS.get((row.get("round") or "").strip())
        if not clue_text or not response or round_name is None:
            continue
        value_raw = (row.get("clue_value") or "").strip()
        clues.append(
            CatalogClue(
                season=season,
                air_date=(row.get("air_date") or "").strip() or None,
                round=round_name,
                category=(row.get("category") or "").strip(),
                value=int(value_raw) if value_raw.isdigit() else None,
                clue_text=clue_text,
                correct_response=response,
                source_key=_source_key(season, row),
            )
        )
    return clues


def _clean(value: str | None) -> str:
    # The dataset escapes quotes with backslashes ("\\'"); they are not part of the text.
    return (value or "").replace("\\", "").strip()


def _source_key(season: int, row: dict[str, str]) -> str:
    parts = [str(season), row.get("air_date", ""), row.get("round", ""), row.get("category", ""), row.get("answer", "")]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:32]
