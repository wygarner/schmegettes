"""
Reads task briefs (tasks/{task-name}/task-brief.md) and builds the body of
their tracking issue.

The scripts that use this run from a trusted checkout of the base branch, with
the pull request's content as the working directory. Brief files are read as
data only.
"""

import re
from pathlib import Path

TASK_TYPES = ("new-feature", "enhancement", "improvement", "bug-fix")

# A task name goes into a path, a `git mv`, and a branch name.
TASK_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")

# The tracking key: GH-{issue number}. GitHub autolinks it to the issue.
KEY_PATTERN = re.compile(r"^GH-([0-9]+)$")

# Matches a folder name that already carries a key, e.g. "buzzer-lockout-GH-12".
KEYED_DIR = re.compile(r"-GH-\d+$")

# GitHub's issue body limit is 65,536 characters; leave room for the footer.
MAX_BODY_CHARS = 65000

STATUS_LABELS = ("status:planned", "status:in-progress", "status:in-review")

# name -> (color, description)
LABELS = {
    "task": ("5319e7", "Tracks a task folder in tasks/"),
    "type:new-feature": ("0e8a16", "Task type: new feature"),
    "type:enhancement": ("1d76db", "Task type: enhancement"),
    "type:improvement": ("c5def5", "Task type: improvement"),
    "type:bug-fix": ("d93f0b", "Task type: bug fix"),
    "status:planned": ("ededed", "Spec PR open"),
    "status:in-progress": ("fbca04", "Spec merged; being implemented"),
    "status:in-review": ("0052cc", "Implementation PR open"),
}


class BriefError(Exception):
    pass


def parse_frontmatter(filepath):
    """Parse YAML frontmatter from a markdown file. Returns dict or None."""
    try:
        content = Path(filepath).read_text()
    except FileNotFoundError:
        return None

    if not content.startswith("---"):
        return None

    end = content.find("\n---", 3)
    if end == -1:
        return None

    fm_text = content[3:end].strip()
    result = {}
    for line in fm_text.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def extract_brief_body(filepath):
    """Extract the markdown content below the YAML frontmatter."""
    try:
        content = Path(filepath).read_text()
    except FileNotFoundError:
        return ""

    if not content.startswith("---"):
        return content

    end = content.find("\n---", 3)
    if end == -1:
        return content

    body_start = content.find("\n", end + 1) + 1
    return content[body_start:]


def read_brief(path):
    """Return (task_type, task_title, body). Raises BriefError on bad frontmatter."""
    fm = parse_frontmatter(path)
    if not fm:
        raise BriefError(f"{path} has no frontmatter")
    if "task-type" not in fm and ("jira-type" in fm or "jira-title" in fm):
        raise BriefError(f"{path} uses jira-type/jira-title; rename them to task-type/task-title")
    task_type = fm.get("task-type", "")
    task_title = fm.get("task-title", "")
    if not task_type or not task_title:
        raise BriefError(f"{path} is missing task-type or task-title in its frontmatter")
    if task_type not in TASK_TYPES:
        raise BriefError(f"{path}: unknown task-type {task_type!r} (expected one of {', '.join(TASK_TYPES)})")
    return task_type, task_title, extract_brief_body(path)


def marker(task_name):
    return f"<!-- task-folder: {task_name} -->"


def issue_body(task_name, body, link):
    """The issue body: idempotency marker, a link to the spec, then the spec, cut to fit."""
    head = f"{marker(task_name)}\nSpec: {link}\n\n"
    text = head + body
    if len(text) <= MAX_BODY_CHARS:
        return text
    footer = f"\n\n… truncated. Full spec: {link}"
    room = MAX_BODY_CHARS - len(footer)
    cut = text.rfind("\n", 0, room)
    if cut <= len(head):
        cut = room
    return text[:cut] + footer
