import os
import tempfile
import unittest
from datetime import date
from pathlib import Path

from lib.task_brief import BriefError, LABELS, marker
from lib.task_issues import create_issues, find_briefs
from tests.fakes import FakeGitHub

BRIEF = '---\ntask-type: improvement\ntask-title: "Track tasks"\n---\n# Spec\n'


def link_for(filepath):
    return f"https://github.com/o/r/blob/abc/{filepath}"


class CreateTaskIssueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()

    def add(self, name, text=BRIEF):
        d = self.root / "tasks" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "task-brief.md").write_text(text)
        return f"tasks/{name}/task-brief.md"

    def create(self, client, files, pr_number="7"):
        return create_issues(client, files, link_for, pr_number=pr_number, root=self.root, today=date(2026, 11, 20))

    def test_creates_one_issue_with_labels_marker_and_meta(self):
        client = FakeGitHub()
        tickets = self.create(client, [self.add("tracker-smoke")])
        self.assertEqual(len(tickets), 1)
        self.assertEqual(tickets[0]["dir"], "tracker-smoke")
        self.assertEqual(tickets[0]["key"], "GH-1")
        self.assertEqual(
            tickets[0]["meta"],
            'issue: 1\nkey: GH-1\ntitle: "Track tasks"\ntask-type: improvement\ncreated: 2026-11-20\n',
        )
        issue = client.issues[1]
        self.assertEqual(issue["title"], "Track tasks")
        self.assertEqual({label["name"] for label in issue["labels"]}, {"task", "type:improvement", "status:planned"})
        self.assertIn(marker("tracker-smoke"), issue["body"])
        self.assertEqual(client.comments, [(7, "Tracking issue: GH-1")])
        self.assertEqual(client.labels, set(LABELS))

    def test_rerun_reuses_the_existing_issue(self):
        client = FakeGitHub()
        files = [self.add("tracker-smoke")]
        self.create(client, files)
        tickets = self.create(client, files)
        self.assertEqual(len(client.issues), 1)
        self.assertEqual(tickets[0]["key"], "GH-1")

    def test_only_the_first_brief_gets_an_issue(self):
        client = FakeGitHub()
        tickets = self.create(client, [self.add("one"), self.add("two")])
        self.assertEqual([t["dir"] for t in tickets], ["one"])
        self.assertEqual(len(client.issues), 1)

    def test_skips_keyed_folders_and_existing_meta(self):
        keyed = self.add("done-GH-3")
        meta = self.add("has-meta")
        (self.root / "tasks/has-meta/.task-meta.yml").write_text("issue: 9\n")
        self.assertEqual(find_briefs([keyed, meta, "README.md", ""], self.root), [])

    def test_refuses_bad_paths(self):
        for bad in ["tasks/Bad_Name/task-brief.md", "tasks/a/b/task-brief.md", "other/x/task-brief.md"]:
            with self.subTest(bad=bad), self.assertRaises(BriefError):
                find_briefs([bad], self.root)

    def test_refuses_a_symlinked_brief(self):
        outside = self.root.parent / f"outside-{os.getpid()}.md"
        outside.write_text(BRIEF)
        self.addCleanup(outside.unlink)
        d = self.root / "tasks" / "linked"
        d.mkdir(parents=True)
        (d / "task-brief.md").symlink_to(outside)
        with self.assertRaisesRegex(BriefError, "not a regular file"):
            find_briefs(["tasks/linked/task-brief.md"], self.root)

    def test_jira_frontmatter_fails_before_any_issue(self):
        client = FakeGitHub()
        files = [self.add("old", '---\njira-type: bug-fix\njira-title: "Old"\n---\nBody\n')]
        with self.assertRaisesRegex(BriefError, "task-type/task-title"):
            self.create(client, files)
        self.assertEqual(client.issues, {})


if __name__ == "__main__":
    unittest.main()
