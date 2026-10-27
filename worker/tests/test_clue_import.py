from schmegettes_worker.clue_import import parse_season_tsv

TSV = (
    "round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes\n"
    "1\t200\t0\tWORLD CAPITALS\t\tThis city on the Seine, France\\'s capital\tParis\t1984-09-10\t\n"
    "3\t0\t0\tHISTORY\t\tSigned in 1776\tthe Declaration of Independence\t1984-09-10\t\n"
    "1\t400\t0\tEMPTY\t\t\tNo clue text\t1984-09-10\t\n"
)


def test_parses_rows_and_maps_rounds() -> None:
    clues = parse_season_tsv(1, TSV)
    assert [c.round for c in clues] == ["single", "final"]
    assert clues[0].value == 200
    assert clues[0].correct_response == "Paris"
    assert clues[0].clue_text == "This city on the Seine, France's capital"


def test_skips_rows_without_clue_text() -> None:
    assert all(c.category != "EMPTY" for c in parse_season_tsv(1, TSV))


def test_source_key_is_stable() -> None:
    assert parse_season_tsv(1, TSV)[0].source_key == parse_season_tsv(1, TSV)[0].source_key
    assert parse_season_tsv(1, TSV)[0].source_key != parse_season_tsv(2, TSV)[0].source_key
