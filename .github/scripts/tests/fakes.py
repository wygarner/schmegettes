"""A fake GitHubClient that keeps issues, labels, and comments in memory."""

from lib.github_client import NotFound


class FakeGitHub:
    def __init__(self, issues=None, labels=()):
        self.issues = {i["number"]: i for i in (issues or [])}
        self.labels = set(labels)
        self.comments = []
        self.updates = []
        self.next_number = max(self.issues, default=0) + 1

    def label_exists(self, name):
        return name in self.labels

    def create_label(self, name, color, description):
        self.labels.add(name)

    def task_issues(self):
        return [i for i in self.issues.values() if any(label["name"] == "task" for label in i["labels"])]

    def get_issue(self, number):
        if number not in self.issues:
            raise NotFound(f"/issues/{number}")
        return self.issues[number]

    def create_issue(self, title, body, labels):
        number = self.next_number
        self.next_number += 1
        self.issues[number] = {
            "number": number,
            "title": title,
            "body": body,
            "state": "open",
            "labels": [{"name": n} for n in labels],
        }
        return self.issues[number]

    def update_issue(self, number, **fields):
        self.updates.append((number, fields))
        issue = self.issues[number]
        if "labels" in fields:
            issue["labels"] = [{"name": n} for n in fields["labels"]]
        for key in ("body", "state", "state_reason"):
            if key in fields:
                issue[key] = fields[key]
        return issue

    def comment(self, number, body):
        self.comments.append((number, body))
