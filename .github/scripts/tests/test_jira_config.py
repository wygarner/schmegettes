import unittest

from lib.jira_config import KEYED_DIR, PROJECT_KEY, TRANSITIONS
from lib.markdown_adf import markdown_to_adf


class JiraConfigTest(unittest.TestCase):
    def test_keyed_dir_matches_only_the_configured_key(self):
        self.assertTrue(KEYED_DIR.search(f"buzzer-lockout-{PROJECT_KEY}-12"))
        self.assertFalse(KEYED_DIR.search("buzzer-lockout"))
        self.assertFalse(KEYED_DIR.search("buzzer-lockout-OTHER-12"))

    def test_transition_names_are_set(self):
        self.assertEqual(set(TRANSITIONS), {"inProgress", "inReview", "done"})


class MarkdownAdfTest(unittest.TestCase):
    def test_converts_headings_and_paragraphs(self):
        nodes = markdown_to_adf("## Goal\n\nBuzz in fast.")
        self.assertEqual([n["type"] for n in nodes], ["heading", "paragraph"])


if __name__ == "__main__":
    unittest.main()
