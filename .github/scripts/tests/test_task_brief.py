import tempfile
import unittest
from pathlib import Path

from lib.task_brief import KEYED_DIR, MAX_BODY_CHARS, BriefError, issue_body, marker, read_brief


def write(dirpath, text, name="task-brief.md"):
    path = Path(dirpath) / name
    path.write_text(text)
    return path


class ReadBriefTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_reads_type_title_and_body(self):
        path = write(self.tmp.name, '---\ntask-type: bug-fix\ntask-title: "Buzzers work"\n---\n# Spec\n\nBody.\n')
        self.assertEqual(read_brief(path), ("bug-fix", "Buzzers work", "# Spec\n\nBody.\n"))

    def test_rejects_jira_frontmatter_with_the_rename_message(self):
        path = write(self.tmp.name, '---\njira-type: bug-fix\njira-title: "Old"\n---\nBody\n')
        with self.assertRaisesRegex(BriefError, "rename them to task-type/task-title"):
            read_brief(path)

    def test_rejects_an_unknown_type(self):
        path = write(self.tmp.name, '---\ntask-type: technical-improvement\ntask-title: "X"\n---\nBody\n')
        with self.assertRaisesRegex(BriefError, "new-feature, enhancement, improvement, bug-fix"):
            read_brief(path)

    def test_rejects_missing_frontmatter(self):
        path = write(self.tmp.name, "# No frontmatter\n")
        with self.assertRaises(BriefError):
            read_brief(path)


class IssueBodyTest(unittest.TestCase):
    def test_adds_marker_and_link(self):
        body = issue_body("buzzer-lockout", "# Spec\n", "https://x/spec")
        self.assertTrue(body.startswith(marker("buzzer-lockout") + "\nSpec: https://x/spec\n\n# Spec"))

    def test_truncates_at_a_line_break_with_a_link(self):
        long = "\n".join("line %05d %s" % (i, "x" * 60) for i in range(2000))
        body = issue_body("big", long, "https://x/spec")
        self.assertLessEqual(len(body), MAX_BODY_CHARS)
        self.assertTrue(body.endswith("… truncated. Full spec: https://x/spec"))
        kept = body.split("\n\n… truncated")[0]
        self.assertTrue(kept.endswith("x"), "cut must fall at the end of a whole line")

    def test_short_body_is_untouched(self):
        self.assertNotIn("truncated", issue_body("small", "short", "https://x/spec"))


class KeyedDirTest(unittest.TestCase):
    def test_matches_only_gh_keys(self):
        self.assertTrue(KEYED_DIR.search("buzzer-lockout-GH-12"))
        self.assertFalse(KEYED_DIR.search("buzzer-lockout"))
        self.assertFalse(KEYED_DIR.search("buzzer-lockout-SCH-12"))


if __name__ == "__main__":
    unittest.main()
