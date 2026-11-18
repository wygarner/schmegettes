"""Parsing and content rules for the clue dataset season TSVs (base URL in CLUE_DATASET_BASE_URL).

Each row becomes a catalog clue. `source_key` is stable across re-imports, so the load
upserts on it and running the same season twice changes nothing.

Boards are built from whole categories, so `select_categories` keeps or drops a category as
a unit (docs/product-docs/features/clue-catalog/feature-brief.md).
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

ROUNDS = {"1": "single", "2": "double", "3": "final"}

Rule = Literal["incomplete", "host_note", "show_name", "sound_picture"]
RULES: tuple[Rule, ...] = ("incomplete", "host_note", "show_name", "sound_picture")

# Single and Double categories need all 5 aired clues; Final has 1.
CLUES_PER_CATEGORY = {"single": 5, "double": 5, "final": 1}
# The show we never name, its longtime host, and its clue-presenting team.
SHOW_NAME = re.compile(r"jeopardy|trebek|clue crew", re.IGNORECASE)
# Stage directions ("[music plays]") and wording that points at a picture or a sound.
SOUND_PICTURE = re.compile(
    r"\[|\b(?:seen|shown|heard) here\b|\bpictured\b|\bthis photo\b|\bon the monitor\b|\bhere is a map\b",
    re.IGNORECASE,
)


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
    has_note: bool = False


@dataclass
class SeasonReport:
    season: int
    clues_read: int = 0
    categories_kept: int = 0
    left_out: dict[Rule, int] = field(default_factory=lambda: dict.fromkeys(RULES, 0))


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
                has_note=bool(_clean(row.get("comments"))),
            )
        )
    return clues


def select_categories(season: int, clues: list[CatalogClue]) -> tuple[list[CatalogClue], SeasonReport]:
    """Keep only whole categories that can reach a board. Each dropped category is counted
    under the first rule it breaks, in the order of RULES."""
    report = SeasonReport(season=season, clues_read=len(clues))
    categories: dict[tuple[str | None, str, str], list[CatalogClue]] = defaultdict(list)
    for clue in clues:
        categories[(clue.air_date, clue.round, clue.category)].append(clue)

    kept: list[CatalogClue] = []
    for (_, round_name, category), members in categories.items():
        rule = _broken_rule(round_name, category, members)
        if rule is None:
            kept.extend(members)
            report.categories_kept += 1
        else:
            report.left_out[rule] += 1
    return kept, report


def _broken_rule(round_name: str, category: str, members: list[CatalogClue]) -> Rule | None:
    if len(members) != CLUES_PER_CATEGORY[round_name]:
        return "incomplete"
    if any(c.has_note for c in members):
        return "host_note"
    if SHOW_NAME.search(category) or any(
        SHOW_NAME.search(c.clue_text) or SHOW_NAME.search(c.correct_response) for c in members
    ):
        return "show_name"
    if any(SOUND_PICTURE.search(c.clue_text) for c in members):
        return "sound_picture"
    return None


def _clean(value: str | None) -> str:
    # The dataset escapes quotes with backslashes ("\\'"); they are not part of the text.
    return (value or "").replace("\\", "").strip()


def _source_key(season: int, row: dict[str, str]) -> str:
    parts = [str(season), row.get("air_date", ""), row.get("round", ""), row.get("category", ""), row.get("answer", "")]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:32]
