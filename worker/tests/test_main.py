"""The command-line entry point's argument and configuration checks (no database needed)."""

import argparse

import pytest

from schmegettes_worker import __main__ as entry


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("DATABASE_OWNER_URL", "CLUE_DATASET_BASE_URL", "ANTHROPIC_API_KEY", "DIFFICULTY_MODEL"):
        monkeypatch.delenv(name, raising=False)


def test_positive_accepts_one_or_more() -> None:
    assert entry._positive("3") == 3
    with pytest.raises(argparse.ArgumentTypeError):
        entry._positive("0")


def test_rate_options_reject_zero_and_combinations(capsys: pytest.CaptureFixture[str]) -> None:
    for argv in (["rate-clues", "--limit", "0"], ["rate-clues", "--limit", "5", "--recut"]):
        with pytest.raises(SystemExit) as exit_info:
            entry.main(argv)
        assert exit_info.value.code == 2
    assert "not allowed with" in capsys.readouterr().err


def test_import_rejects_bad_seasons_before_reading_config(capsys: pytest.CaptureFixture[str]) -> None:
    assert entry.main(["import-clues", "--seasons", "banana"]) == 2
    assert capsys.readouterr().err.startswith("--seasons:")


def test_import_needs_owner_url_and_dataset_url(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    assert entry.main(["import-clues", "--seasons", "1"]) == 2
    monkeypatch.setenv("DATABASE_OWNER_URL", "postgresql://fake")
    assert entry.main(["import-clues", "--seasons", "1"]) == 2
    assert "CLUE_DATASET_BASE_URL must be set" in capsys.readouterr().err


def test_rate_needs_owner_url(capsys: pytest.CaptureFixture[str]) -> None:
    assert entry.main(["rate-clues"]) == 2
    assert "DATABASE_OWNER_URL must be set" in capsys.readouterr().err


def test_rate_needs_an_api_key_only_when_it_calls_claude(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATABASE_OWNER_URL", "postgresql://fake")
    for argv in (["rate-clues"], ["rate-clues", "--recut"], ["rate-clues", "--check-order", "5"]):
        assert entry.main(argv) == 2
        assert "ANTHROPIC_API_KEY must be set" in capsys.readouterr().err

    # The hand check reads and writes a sheet only, so it goes on to connect without a key.
    connected: list[str] = []

    def refuse(url: str, **_: object) -> None:
        connected.append(url)
        raise RuntimeError("no database in this test")

    monkeypatch.setattr(entry.psycopg, "connect", refuse)
    with pytest.raises(RuntimeError):
        entry.main(["rate-clues", "--handcheck-export", "sheet.csv"])
    assert connected == ["postgresql://fake"]
