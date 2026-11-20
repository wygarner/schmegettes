"""
GitHub REST API client for task issues (standard library only).

Auth is the workflow's GITHUB_TOKEN. The repository comes from
GITHUB_REPOSITORY. Tests replace this class with a fake that has the same
methods.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request


class NotFound(Exception):
    pass


class GitHubClient:
    def __init__(self, token=None, repo=None, api_url=None):
        self.token = token or os.environ["GITHUB_TOKEN"]
        self.repo = repo or os.environ["GITHUB_REPOSITORY"]
        self.api_url = (api_url or os.environ.get("GITHUB_API_URL") or "https://api.github.com").rstrip("/")

    def _request(self, method, path, body=None):
        req = urllib.request.Request(
            f"{self.api_url}/repos/{self.repo}{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound(path) from e
            raise RuntimeError(f"GitHub API {method} {path}: {e.code} {e.read().decode()[:500]}") from e

    # Labels

    def label_exists(self, name):
        try:
            self._request("GET", f"/labels/{urllib.parse.quote(name, safe='')}")
            return True
        except NotFound:
            return False

    def create_label(self, name, color, description):
        self._request("POST", "/labels", {"name": name, "color": color, "description": description})

    # Issues

    def task_issues(self):
        """Every issue labelled `task`, open or closed."""
        issues, page = [], 1
        while True:
            batch = self._request("GET", f"/issues?labels=task&state=all&per_page=100&page={page}")
            issues.extend(i for i in batch if "pull_request" not in i)
            if len(batch) < 100:
                return issues
            page += 1

    def get_issue(self, number):
        return self._request("GET", f"/issues/{number}")

    def create_issue(self, title, body, labels):
        return self._request("POST", "/issues", {"title": title, "body": body, "labels": labels})

    def update_issue(self, number, **fields):
        return self._request("PATCH", f"/issues/{number}", fields)

    def comment(self, number, body):
        self._request("POST", f"/issues/{number}/comments", {"body": body})
