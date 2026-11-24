"""Rating categories Easy, Medium or Hard: requests, replies, the scale, a run's steps, and the
quality gate. No network: the batch client and the store are fakes."""

from __future__ import annotations

import hashlib
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path

import pytest

from schmegettes_worker import clue_rate
from schmegettes_worker.clue_rate import (
    BatchStatus,
    Category,
    Kind,
    Level,
    Result,
    category_message,
    cut_points,
    level,
    parse_score,
    rate,
    request_params,
)


def cat(key: str, kind: Kind = "board", season: int = 1) -> Category:
    clues = (("c1", "r1"),) if kind == "final" else tuple((f"c{i}", f"r{i}") for i in range(1, 5))
    return Category(key, kind, f"NAME {key}", season, clues)


class FakeBatches:
    """Scores every request with `scorer(custom_id)`: an int, or a failure string."""

    def __init__(self, scorer: Callable[[str], int | str]) -> None:
        self.scorer = scorer
        self.submitted: list[list[str]] = []
        self.pending: dict[str, list[str]] = {}
        self.polls_before_end = 0

    def submit(self, requests: list[tuple[str, str]]) -> str:
        batch_id = f"batch-{len(self.submitted) + 1}"
        self.submitted.append([r[0] for r in requests])
        self.pending[batch_id] = [r[0] for r in requests]
        return batch_id

    def status(self, batch_id: str) -> BatchStatus:
        if batch_id not in self.pending:
            return "missing"
        if self.polls_before_end:
            self.polls_before_end -= 1
            return "in_progress"
        return "ended"

    def results(self, batch_id: str) -> Iterable[Result]:
        for key in self.pending[batch_id]:
            value = self.scorer(key)
            if isinstance(value, int):
                yield Result(key, value, None, 100, 20)
            else:
                yield Result(key, None, value, 100, 0)


class MemoryStore:
    """The Store protocol over dicts, mirroring PgStore's rules."""

    def __init__(self, categories: list[Category]) -> None:
        self.categories = {c.key: c for c in categories}
        self.rows: dict[str, dict[str, object]] = {}
        self.scales: dict[Kind, tuple[int, int]] = {}

    def pending_batches(self) -> list[str]:
        return sorted({str(r["batch_id"]) for r in self.rows.values() if r["batch_id"] and r["score"] is None})

    def unrated(self, limit: int | None, skip: set[str] | None = None) -> list[Category]:
        todo = [
            c
            for k, c in sorted(self.categories.items())
            if (k not in self.rows or (self.rows[k]["score"] is None and self.rows[k]["batch_id"] is None))
            and k not in (skip or set())
        ]
        return todo if limit is None else todo[:limit]

    def mark_submitted(self, categories: list[Category], batch_id: str) -> None:
        for c in categories:
            row = self.rows.setdefault(c.key, {"score": None, "difficulty": None, "failures": 0})
            row["batch_id"] = batch_id

    def record(self, batch_id: str, results: list[Result], model: str) -> tuple[int, int]:
        good = 0
        for r in results:
            row = self.rows.get(r.custom_id)
            if row and row["batch_id"] == batch_id and r.score is not None:
                row.update(score=r.score, batch_id=None)
                good += 1
        failed = 0
        for row in self.rows.values():
            if row["batch_id"] == batch_id and row["score"] is None:
                row["batch_id"] = None
                row["failures"] = int(str(row["failures"])) + 1
                failed += 1
        return good, failed

    def scale(self, kind: Kind) -> tuple[int, int] | None:
        return self.scales.get(kind)

    def unscored(self, kind: Kind) -> int:
        return sum(
            1
            for k, c in self.categories.items()
            if c.kind == kind
            and self.rows.get(k, {}).get("score") is None
            and int(str(self.rows.get(k, {}).get("failures", 0))) < clue_rate.GIVE_UP_AFTER
        )

    def names(self, keys: list[str]) -> dict[str, str]:
        return {k: f"NAME {k} (season 1, single)" for k in keys if k in self.categories}

    def scores(self, kind: Kind) -> list[int]:
        return [int(str(r["score"])) for k, r in self.rows.items() if self.categories[k].kind == kind and r["score"]]

    def set_scale(self, kind: Kind, easy_max: int, medium_max: int, categories: int) -> None:
        self.scales.setdefault(kind, (easy_max, medium_max))

    def label(self, kind: Kind, easy_max: int, medium_max: int) -> int:
        n = 0
        for k, r in self.rows.items():
            if self.categories[k].kind == kind and r["score"] is not None and r["difficulty"] is None:
                r["difficulty"] = level(int(str(r["score"])), easy_max, medium_max)
                n += 1
        return n

    def counts(self) -> dict[str, int]:
        labels = Counter(str(r["difficulty"]) for r in self.rows.values() if r["difficulty"])
        return {
            "easy": labels["easy"],
            "medium": labels["medium"],
            "hard": labels["hard"],
            "unlabelled": sum(1 for r in self.rows.values() if r["score"] is not None and r["difficulty"] is None),
            "failed": sum(1 for r in self.rows.values() if r["score"] is None and int(str(r["failures"])) > 0),
            "still_unrated": sum(1 for k in self.categories if self.rows.get(k, {}).get("score") is None),
        }

    def decades(self) -> dict[str, Counter[str]]:
        return {}

    def clear_labels(self) -> None:
        self.scales.clear()
        for r in self.rows.values():
            r["difficulty"] = None


def by_number(key: str) -> int:
    """Keys like "b07" score 7."""
    return int(key[1:])


# ---------------------------------------------------------------------------
# Requests and replies
# ---------------------------------------------------------------------------


def test_category_message_lists_the_clues_in_board_order() -> None:
    text = category_message(cat("k"))
    assert text.splitlines()[0] == "Category: NAME k"
    assert text.index("Clue 1: c1") < text.index("Response 1: r1") < text.index("Clue 4: c4")
    assert "Clue 5" not in text


def test_request_params_ask_for_a_score_at_low_effort() -> None:
    params = request_params("claude-haiku-5-5", "SYSTEM", "Category: X")
    assert params["model"] == "claude-haiku-5-5"
    assert params["system"] == "SYSTEM"
    assert params["messages"] == [{"role": "user", "content": "Category: X"}]
    output_config = params["output_config"]
    assert output_config.get("effort") == "low"
    assert output_config.get("format") == {"type": "json_schema", "schema": clue_rate.SCORE_SCHEMA}
    assert "thinking" not in params and "temperature" not in params


@pytest.mark.parametrize(
    ("stop_reason", "texts", "expected"),
    [
        ("end_turn", ['{"score": 42}'], (42, None)),
        ("end_turn", ['{"score": 1}'], (1, None)),
        ("end_turn", ['{"score": 100}'], (100, None)),
        ("refusal", [], (None, "refusal")),
        ("max_tokens", ['{"sco'], (None, "max_tokens")),
        ("end_turn", ["not json"], (None, "invalid")),
        ("end_turn", ['{"score": 0}'], (None, "invalid")),
        ("end_turn", ['{"score": 101}'], (None, "invalid")),
        ("end_turn", ['{"score": true}'], (None, "invalid")),
        ("end_turn", ['{"score": 4.5}'], (None, "invalid")),
        ("end_turn", ['{"other": 4}'], (None, "invalid")),
        ("end_turn", [], (None, "invalid")),
    ],
)
def test_parse_score(stop_reason: str, texts: list[str], expected: tuple[int | None, str | None]) -> None:
    assert parse_score(stop_reason, texts) == expected


def test_prompt_never_names_the_show() -> None:
    prompt = clue_rate.PROMPT_PATH.read_text("utf-8").lower()
    assert "jeopardy" not in prompt and "trebek" not in prompt


# ---------------------------------------------------------------------------
# The scale
# ---------------------------------------------------------------------------


def test_cut_points_split_into_thirds() -> None:
    assert cut_points(list(range(1, 10))) == (3, 6)
    assert cut_points(list(range(1, 101))) == (33, 67)
    assert cut_points([50]) == (50, 50)


def test_ties_at_a_cut_point_go_to_the_lower_level() -> None:
    # Four categories tied at 20: putting them in Easy would make it 5 of 6, so the first cut goes
    # below them, and the second cut takes them all into Medium.
    e, m = cut_points([10, 20, 20, 20, 20, 90])
    assert (e, m) == (10, 20)
    assert [level(s, e, m) for s in (10, 20, 90)] == ["easy", "medium", "hard"]


def test_a_big_tie_at_the_upper_cut_goes_to_hard_when_that_balances_better() -> None:
    # 100 scores: 40 at 30, 20 at 45, 40 at 70. The first cut keeps the 30s in Easy (40% beats 60%);
    # the second can take the 45s into Medium (60% at or below) or leave them for Hard (40% at or
    # below): 60 is nearer 66.7 than 40, so Medium; Hard keeps the 70s.
    scores = [30] * 40 + [45] * 20 + [70] * 40
    assert cut_points(scores) == (30, 45)
    # Staging's shape in small: under the old rule (the score at the 2/3 mark, ties down) the 45s
    # all went to Medium and Hard got only 25%. Now the cut stops below them: Hard gets 37%.
    scores = [20] * 33 + [40] * 30 + [45] * 12 + [60] * 25
    e, m = cut_points(scores)
    assert (e, m) == (20, 40)
    assert Counter(level(s, e, m) for s in scores) == {"easy": 33, "medium": 30, "hard": 37}


def test_cut_points_need_scores() -> None:
    with pytest.raises(ValueError):
        cut_points([])


# ---------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------


def catalog() -> list[Category]:
    return [cat(f"b{n:02d}") for n in range(1, 10)] + [cat(f"f{n:02d}", "final") for n in range(1, 4)]


def test_a_run_rates_every_category_then_labels_by_thirds() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    report = rate(store, client, model="claude-haiku-5-5", sleep=lambda _: None)
    assert report.submitted == 12 and report.scored == 12 and report.failed == 0
    assert store.scales == {"board": (3, 6), "final": (1, 2)}
    assert report.counts == {"easy": 4, "medium": 4, "hard": 4, "unlabelled": 0, "failed": 0, "still_unrated": 0}
    assert store.rows["b03"]["difficulty"] == "easy" and store.rows["b04"]["difficulty"] == "medium"


def test_running_again_submits_nothing_and_changes_nothing() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    rate(store, client, model="m", sleep=lambda _: None)
    before = {k: dict(v) for k, v in store.rows.items()}
    again = rate(store, client, model="m", sleep=lambda _: None)
    assert again.submitted == 0 and len(client.submitted) == 1
    assert store.rows == before and store.scales == {"board": (3, 6), "final": (1, 2)}


def test_new_categories_are_labelled_on_the_existing_scale() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    rate(store, client, model="m", sleep=lambda _: None)
    store.categories["b50"] = cat("b50")  # loaded later; scores 50 on a scale cut at 3 and 6
    rate(store, client, model="m", sleep=lambda _: None)
    assert store.rows["b50"]["difficulty"] == "hard"
    assert store.scales["board"] == (3, 6)


def test_the_scale_waits_while_a_category_of_its_kind_is_unscored() -> None:
    store = MemoryStore(catalog())
    flaky = FakeBatches(lambda key: "refusal" if key == "b05" else by_number(key))
    report = rate(store, flaky, model="m", sleep=lambda _: None)
    assert report.failed == 1 and len(flaky.submitted) == 1  # not resubmitted in the same run
    assert "board" not in store.scales and store.scales["final"] == (1, 2)
    assert report.waiting == {"board": 1}
    assert report.counts["unlabelled"] == 8 and report.counts["failed"] == 1

    rate(store, FakeBatches(by_number), model="m", sleep=lambda _: None)  # the next run retries b05
    assert store.scales["board"] == (3, 6)
    assert store.rows["b05"]["difficulty"] == "medium" and store.rows["b05"]["failures"] == 1


def test_a_category_that_keeps_failing_stops_holding_back_the_scale() -> None:
    store = MemoryStore(catalog())
    refuses_b05 = FakeBatches(lambda key: "refusal" if key == "b05" else by_number(key))
    rate(store, refuses_b05, model="m", sleep=lambda _: None)
    assert "board" not in store.scales  # one failure: still waits

    second = rate(store, refuses_b05, model="m", sleep=lambda _: None)  # retried, fails again
    assert second.submitted == 1 and store.rows["b05"]["failures"] == 2
    assert store.scales["board"] == (3, 6)  # cut from the 8 that have scores: 1-4 and 6-9
    assert store.rows["b05"]["difficulty"] is None  # unrated: plays as Medium
    assert second.counts["still_unrated"] == 1 and second.counts["easy"] == 3 + 1  # b01-b03 + f01

    third = rate(store, FakeBatches(by_number), model="m", sleep=lambda _: None)  # still retried
    assert third.submitted == 1
    assert store.rows["b05"]["difficulty"] == "medium"  # labelled on the scale already set
    assert store.scales["board"] == (3, 6)


def test_the_report_names_what_failed_and_why() -> None:
    store = MemoryStore(catalog())
    report = rate(
        store, FakeBatches(lambda k: "refusal" if k == "b05" else by_number(k)), model="m", sleep=lambda _: None
    )
    assert report.failures == [("b05", "refusal")]
    text = clue_rate.render_report(report, "m")
    assert "failed this run" in text and "  NAME b05 (season 1, single): refusal" in text


def test_an_interrupted_run_collects_its_batch_instead_of_resubmitting() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    todo = store.unrated(None)
    batch_id = client.submit([(c.key, category_message(c)) for c in todo])
    store.mark_submitted(todo, batch_id)  # ... and the run stopped here

    client.polls_before_end = 2
    slept: list[float] = []
    report = rate(store, client, model="m", sleep=slept.append)
    assert len(client.submitted) == 1 and report.submitted == 0 and report.scored == 12
    assert slept == [clue_rate.POLL_S, clue_rate.POLL_S]


def test_a_batch_the_api_no_longer_has_fails_its_rows_for_a_retry() -> None:
    store = MemoryStore(catalog())
    store.mark_submitted(store.unrated(3), "gone")
    client = FakeBatches(by_number)
    report = rate(store, client, model="m", sleep=lambda _: None)
    assert report.failed == 3  # collected as missing ...
    assert report.submitted == 12  # ... then submitted again with everything else
    assert report.counts["still_unrated"] == 0


def test_limit_and_batch_size(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clue_rate, "BATCH_SIZE", 4)
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    report = rate(store, client, model="m", limit=10, sleep=lambda _: None)
    assert [len(b) for b in client.submitted] == [4, 4, 2]
    assert report.submitted == 10 and report.counts["still_unrated"] == 2
    # All 9 board categories are scored, so their scale is set; 2 of 3 Finals aren't, so theirs waits.
    assert store.scales == {"board": (3, 6)} and report.waiting == {"final": 2}


def test_report() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    report = rate(store, client, model="claude-haiku-5-5", sleep=lambda _: None)
    text = clue_rate.render_report(report, "claude-haiku-5-5")
    lines = text.splitlines()
    assert lines[0].split() == ["rated", "easy", "medium", "hard", "failed", "still", "unrated"]
    assert lines[1].split() == ["12", "4", "4", "4", "0", "0"]
    assert "board scale: easy <= 3, medium <= 6, hard above" in text
    assert "tokens: 1,200 in, 240 out (claude-haiku-5-5), about $0.00 at batch prices" in text
    assert "about $" not in clue_rate.render_report(report, "some-other-model")


def test_estimated_cost() -> None:
    assert clue_rate.estimated_cost("claude-haiku-5-5", 1_000_000, 1_000_000) == pytest.approx(0.30)
    assert clue_rate.estimated_cost("unknown", 1, 1) is None


# ---------------------------------------------------------------------------
# Quality gate
# ---------------------------------------------------------------------------


def test_check_order_passes_when_scores_climb_with_the_rows() -> None:
    cats = [cat(f"k{n}") for n in range(10)]

    def rising(custom_id: str) -> int:
        key, _, row = custom_id.rpartition("-")
        flat = key in ("k0", "k1")  # 2 of 10 don't climb: 80% still passes
        return 50 if flat else 20 + 10 * int(row)

    check = clue_rate.check_order(cats, FakeBatches(rising), sleep=lambda _: None)
    assert check.categories == 10 and check.rising == 8 and check.passed
    assert check.row_means[0] < check.row_means[3]
    assert "PASS" in clue_rate.render_order_check(check)


def test_check_order_fails_when_scores_dont_climb() -> None:
    cats = [cat(f"k{n}") for n in range(10)]
    check = clue_rate.check_order(cats, FakeBatches(lambda _: 50), sleep=lambda _: None)
    assert check.rising == 0 and not check.passed


def test_check_order_ignores_categories_with_a_failed_clue() -> None:
    cats = [cat("good"), cat("bad")]
    check = clue_rate.check_order(
        cats, FakeBatches(lambda cid: "errored" if cid == "bad-2" else 10 + int(cid[-1])), sleep=lambda _: None
    )
    assert check.categories == 1 and check.rising == 1


def test_slope() -> None:
    assert clue_rate.slope([1, 2, 3, 4]) > 0
    assert clue_rate.slope([4, 3, 2, 1]) < 0
    assert clue_rate.slope([5, 5, 5, 5]) == 0


def hand_sheet(tmp_path: Path, labels: list[str]) -> tuple[Path, dict[str, Level]]:
    """A filled-in sheet: category kNN gets labels[NN]; Claude said Easy for all of them."""
    keys = [f"k{n:02d}" for n in range(len(labels))]
    path = tmp_path / "handcheck.csv"
    clue_rate.write_handcheck([cat(k) for k in keys], path)
    header, *rows = path.read_text("utf-8").splitlines()
    mine = dict(zip(keys, labels, strict=True))
    path.write_text("\n".join([header] + [row + mine[row.split(",")[0]] for row in rows]))
    return path, dict.fromkeys(keys, "easy")


def test_handcheck_sheet_leaves_claudes_label_out(tmp_path: Path) -> None:
    path = tmp_path / "sheet.csv"
    clue_rate.write_handcheck([cat("k1")], path)
    header, row = path.read_text("utf-8").splitlines()
    assert header == "category_key,category,clues,my_label"
    assert row == "k1,NAME k1,c1 -> r1 | c2 -> r2 | c3 -> r3 | c4 -> r4,"


def test_handcheck_scoring(tmp_path: Path) -> None:
    labels = ["easy"] * 45 + ["m"] * 10 + ["Hard"] * 5
    path, claude = hand_sheet(tmp_path, labels)
    check = clue_rate.score_handcheck(clue_rate.read_handcheck(path), claude)
    assert (check.agree, check.total, check.passed) == (45, 60, True)
    assert check.confusion[("medium", "easy")] == 10
    text = clue_rate.render_handcheck(check)
    assert text.splitlines()[0] == "agree: 45 of 60 (45 of 60 needed)" and text.endswith("PASS")


def test_handcheck_fails_below_45(tmp_path: Path) -> None:
    path, claude = hand_sheet(tmp_path, ["easy"] * 44 + ["hard"] * 16)
    assert not clue_rate.score_handcheck(clue_rate.read_handcheck(path), claude).passed


def test_handcheck_rejects_a_blank_or_unknown_label(tmp_path: Path) -> None:
    path, _ = hand_sheet(tmp_path, ["easy", "", "medium"])
    with pytest.raises(ValueError, match="must be easy, medium or hard"):
        clue_rate.read_handcheck(path)


def test_handcheck_needs_every_category_labelled_here(tmp_path: Path) -> None:
    path, claude = hand_sheet(tmp_path, ["easy", "easy"])
    claude.pop("k01")
    with pytest.raises(ValueError, match="1 categories"):
        clue_rate.score_handcheck(clue_rate.read_handcheck(path), claude)


def test_key_hashing_helper_is_stable() -> None:
    # custom_id is the category_key: 32 hex characters, inside the API's 64-character limit.
    key = hashlib.md5(b"x", usedforsecurity=False).hexdigest()
    assert len(key) == 32 and len(f"{key}-3") <= 64


def test_recut_relabels_from_stored_scores_without_calling_claude() -> None:
    store, client = MemoryStore(catalog()), FakeBatches(by_number)
    rate(store, client, model="m", sleep=lambda _: None)
    store.scales["board"] = (1, 2)  # a scale cut under an older rule
    store.rows["b05"]["difficulty"] = "hard"
    report = clue_rate.recut(store, client, model="m")
    assert len(client.submitted) == 1 and report.submitted == 0  # nothing new sent
    assert store.scales["board"] == (3, 6) and store.rows["b05"]["difficulty"] == "medium"
