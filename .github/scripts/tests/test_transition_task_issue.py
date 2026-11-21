import unittest

from lib.task_issues import transition
from tests.fakes import FakeGitHub


def issue(number=5, labels=("task", "type:bug-fix", "status:planned"), state="open", body="old"):
    return {"number": number, "title": "T", "body": body, "state": state, "labels": [{"name": n} for n in labels]}


def label_names(client, number=5):
    return {label["name"] for label in client.issues[number]["labels"]}


class TransitionTest(unittest.TestCase):
    def test_in_progress_swaps_status_and_replaces_body(self):
        client = FakeGitHub([issue()])
        transition(client, 5, "inProgress", body="merged spec")
        self.assertEqual(label_names(client), {"task", "type:bug-fix", "status:in-progress"})
        self.assertEqual(client.issues[5]["body"], "merged spec")

    def test_in_progress_without_a_body_keeps_it(self):
        client = FakeGitHub([issue()])
        transition(client, 5, "inProgress")
        self.assertEqual(client.issues[5]["body"], "old")

    def test_in_review(self):
        client = FakeGitHub([issue(labels=("task", "status:in-progress"))])
        transition(client, 5, "inReview")
        self.assertEqual(label_names(client), {"task", "status:in-review"})

    def test_done_closes_as_completed_and_comments(self):
        client = FakeGitHub([issue(labels=("task", "type:bug-fix", "status:in-review"))])
        transition(client, 5, "done", pr_number="40")
        self.assertEqual(client.issues[5]["state"], "closed")
        self.assertEqual(client.issues[5]["state_reason"], "completed")
        self.assertEqual(label_names(client), {"task", "type:bug-fix"})
        self.assertEqual(client.comments, [(5, "Done in #40.")])

    def test_every_step_is_a_no_op_the_second_time(self):
        for step, kwargs in [("inProgress", {"body": "b"}), ("inReview", {}), ("done", {"pr_number": "1"})]:
            with self.subTest(step=step):
                client = FakeGitHub([issue()])
                transition(client, 5, step, **kwargs)
                updates, comments = len(client.updates), len(client.comments)
                self.assertEqual(transition(client, 5, step, **kwargs), "no change")
                self.assertEqual((len(client.updates), len(client.comments)), (updates, comments))

    def test_not_merged_only_comments(self):
        client = FakeGitHub([issue()])
        transition(client, 5, "notMerged", pr_number="12")
        self.assertEqual(client.comments, [(5, "Spec PR #12 closed without merging.")])
        self.assertEqual(client.updates, [])
        self.assertIn("status:planned", label_names(client))

    def test_missing_issue_raises(self):
        with self.assertRaisesRegex(LookupError, "#9 does not exist"):
            transition(FakeGitHub(), 9, "inReview")

    def test_unknown_step_raises(self):
        with self.assertRaises(ValueError):
            transition(FakeGitHub([issue()]), 5, "archive")


if __name__ == "__main__":
    unittest.main()
