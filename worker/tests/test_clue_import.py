from schmegettes_worker.clue_import import parse_season_tsv, select_categories

HEADER = "round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes\n"

TSV = (
    HEADER + "1\t200\t0\tWORLD CAPITALS\t\tThis city on the Seine, France\\'s capital\tParis\t1984-09-10\t\n"
    "3\t0\t0\tHISTORY\t\tSigned in 1776\tthe Declaration of Independence\t1984-09-10\t\n"
    "1\t400\t0\tEMPTY\t\t\tNo clue text\t1984-09-10\t\n"
)


def category(
    name: str,
    *,
    round_: str = "1",
    count: int = 5,
    comment: str = "",
    clue: str = "A plain clue about {name}",
    response: str = "a response",
    air_date: str = "2023-09-11",
) -> str:
    rows = []
    for i in range(1, count + 1):
        text = clue.format(name=name) + f" #{i}"
        rows.append(f"{round_}\t{200 * i}\t0\t{name}\t{comment}\t{text}\t{response}\t{air_date}\t\n")
    return "".join(rows)


def test_parses_rows_and_maps_rounds() -> None:
    clues = parse_season_tsv(1, TSV)
    assert [c.round for c in clues] == ["single", "final"]
    assert clues[0].value == 200
    assert clues[0].correct_response == "Paris"
    assert clues[0].clue_text == "This city on the Seine, France's capital"
    assert not clues[0].has_note


def test_skips_rows_without_clue_text() -> None:
    assert all(c.category != "EMPTY" for c in parse_season_tsv(1, TSV))


def test_source_key_is_stable() -> None:
    assert parse_season_tsv(1, TSV)[0].source_key == parse_season_tsv(1, TSV)[0].source_key
    assert parse_season_tsv(1, TSV)[0].source_key != parse_season_tsv(2, TSV)[0].source_key


def test_reads_the_host_note() -> None:
    clues = parse_season_tsv(40, HEADER + category("KIN", comment='(Ken: "He\\\'s just Kin.")', count=1))
    assert clues[0].has_note


def select(tsv_body: str) -> tuple[list[str], dict[str, int], int]:
    clues = parse_season_tsv(40, HEADER + tsv_body)
    kept, report = select_categories(40, clues)
    return sorted({c.category for c in kept}), dict(report.left_out), report.categories_kept


def test_keeps_a_complete_clean_category() -> None:
    kept, left_out, count = select(category("SCIENCE CLASS"))
    assert kept == ["SCIENCE CLASS"]
    assert count == 1
    assert sum(left_out.values()) == 0


def test_drops_incomplete_categories() -> None:
    kept, left_out, _ = select(category("FOUR ONLY", count=4) + category("DOUBLE", round_="2"))
    assert kept == ["DOUBLE"]
    assert left_out["incomplete"] == 1


def test_drops_categories_with_a_host_note() -> None:
    kept, left_out, _ = select(category("RHYMES", comment="(Alex: each response rhymes)"))
    assert kept == []
    assert left_out["host_note"] == 1


def test_drops_categories_that_name_the_show_anywhere() -> None:
    body = (
        category("THE JEOPARDY! ORCHESTRA")
        + category("HOSTS", clue="Alex Trebek hosted this {name}")
        + category("LAW", response="double jeopardy")
        + category("CREW", clue="The Clue Crew went to {name}")
    )
    kept, left_out, _ = select(body)
    assert kept == []
    assert left_out["show_name"] == 4


def test_drops_categories_that_need_sound_or_a_picture() -> None:
    body = (
        category("SONGS", clue="[Instrumental guitar opening plays] {name}")
        + category("MAPS", clue="Here is a map of this former country, {name}")
        + category("ART", clue="The painting seen here is in {name}")
    )
    kept, left_out, _ = select(body)
    assert kept == []
    assert left_out["sound_picture"] == 3


def test_one_bad_clue_drops_the_whole_category() -> None:
    body = category("MIXED", count=4) + "1\t1000\t0\tMIXED\t\tThis photo shows a bridge\tSF\t2023-09-11\t\n"
    kept, left_out, _ = select(body)
    assert kept == []
    assert left_out["sound_picture"] == 1


def test_a_final_needs_one_clue_and_follows_the_other_rules() -> None:
    body = category("FINAL OK", round_="3", count=1) + category("FINAL NOTE", round_="3", count=1, comment="(note)")
    kept, left_out, count = select(body)
    assert kept == ["FINAL OK"]
    assert count == 1
    assert left_out["host_note"] == 1


def test_counts_the_first_rule_broken() -> None:
    # Incomplete and noted: counted once, as incomplete.
    _, left_out, _ = select(category("BOTH", count=3, comment="(note)"))
    assert left_out == {"incomplete": 1, "host_note": 0, "show_name": 0, "sound_picture": 0}


def test_same_category_name_on_different_days_is_two_categories() -> None:
    body = category("SCIENCE", air_date="2023-09-11") + category("SCIENCE", air_date="2023-09-12")
    _, _, count = select(body)
    assert count == 2
