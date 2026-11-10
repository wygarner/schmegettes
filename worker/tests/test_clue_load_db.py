"""Loads a fixture season into a real database twice. Runs only when DATABASE_OWNER_URL is set
(local Supabase: `mise run db:start`); CI's worker job has no database, so it skips there."""

import os

import psycopg
import pytest

from schmegettes_worker.clue_load import PgStore, load_seasons
from tests.test_clue_import import HEADER, category

OWNER_URL = os.environ.get("DATABASE_OWNER_URL")
SEASON = 9999  # far from any real season, and deleted afterwards

pytestmark = pytest.mark.skipif(not OWNER_URL, reason="DATABASE_OWNER_URL not set")


def fetch(season: int) -> str:
    return (
        HEADER
        + category("DB TEST SINGLE")
        + category("DB TEST DOUBLE", round_="2")
        + category("F", round_="3", count=1)
    )


def test_second_load_inserts_nothing_and_keeps_ids() -> None:
    assert OWNER_URL
    with psycopg.connect(OWNER_URL, autocommit=True) as conn:
        try:
            store = PgStore(conn)
            first = load_seasons([SEASON], fetch=fetch, store=store, env="local")
            assert first[0].inserted == 11
            ids = conn.execute("select id from public.clues where season = %s order by id", (SEASON,)).fetchall()

            again = load_seasons([SEASON], fetch=fetch, store=store, env="local")
            assert again[0].ok and again[0].inserted == 0
            assert (
                conn.execute("select id from public.clues where season = %s order by id", (SEASON,)).fetchall() == ids
            )
        finally:
            conn.execute("delete from public.clues where season = %s", (SEASON,))
