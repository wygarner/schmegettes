"""
Task issue logic shared by create-task-issue.py and transition-task-issue.py.

`client` is a GitHubClient, or a fake with the same methods in tests.
"""

from pathlib import Path

from lib.github_client import NotFound
from lib.task_brief import (
    KEYED_DIR,
    LABELS,
    STATUS_LABELS,
    TASK_NAME_PATTERN,
    BriefError,
    issue_body,
    marker,
    read_brief,
)

STEPS = ("inProgress", "inReview", "done", "notMerged")
STEP_STATUS = {"inProgress": "status:in-progress", "inReview": "status:in-review"}


def find_briefs(changed_files, root=None):
    """Return the (filepath, task directory) pairs that need an issue.

    Skips folders that already carry a key or a .task-meta.yml. Raises
    BriefError for any other task-brief.md that isn't tasks/{task-name}/task-brief.md.
    """
    root = (root or Path.cwd()).resolve()
    briefs = []
    for filepath in changed_files:
        filepath = filepath.strip()
        if not filepath:
            continue
        path = Path(filepath)
        if path.name != "task-brief.md":
            continue
        dirpath = path.parent
        if KEYED_DIR.search(dirpath.name):
            print(f"Skipping {filepath}: folder already has a key")
            continue
        if (
            path.is_absolute()
            or len(path.parts) != 3
            or path.parts[0] != "tasks"
            or not TASK_NAME_PATTERN.fullmatch(dirpath.name)
        ):
            raise BriefError(
                f"Refusing {filepath!r}: expected tasks/{{task-name}}/task-brief.md "
                f"with a task-name matching {TASK_NAME_PATTERN.pattern}"
            )
        full = root / path
        # A symlink could point the brief at a file outside the repository.
        if full.is_symlink() or full.parent.is_symlink() or root not in full.resolve().parents:
            raise BriefError(f"Refusing {filepath!r}: not a regular file inside the repository")
        meta = full.parent / ".task-meta.yml"
        if meta.exists() or meta.is_symlink():
            print(f"Skipping {filepath}: .task-meta.yml already exists")
            continue
        briefs.append((filepath, dirpath))
    return briefs


def ensure_labels(client):
    for name, (color, description) in LABELS.items():
        if not client.label_exists(name):
            client.create_label(name, color, description)
            print(f"Created label {name}")


def find_existing(client, task_name):
    tag = marker(task_name)
    for issue in client.task_issues():
        if tag in (issue.get("body") or ""):
            return issue["number"]
    return None


def create_issues(client, changed_files, link_for, pr_number=None, root=None, today=None):
    """Create (or reuse) one issue for the first brief. Returns the `tickets` list."""
    briefs = find_briefs(changed_files, root)
    if not briefs:
        return []
    if len(briefs) > 1:
        print(f"Found {len(briefs)} task briefs; only the first ({briefs[0][0]}) gets an issue.")
        briefs = briefs[:1]

    root = (root or Path.cwd()).resolve()
    ensure_labels(client)
    tickets = []
    for filepath, dirpath in briefs:
        task_name = dirpath.name
        task_type, task_title, body = read_brief(root / filepath)
        number = find_existing(client, task_name)
        if number:
            print(f"Reusing issue #{number} for tasks/{task_name}")
        else:
            issue = client.create_issue(
                task_title,
                issue_body(task_name, body, link_for(filepath)),
                ["task", f"type:{task_type}", "status:planned"],
            )
            number = issue["number"]
            print(f"Created issue #{number} for tasks/{task_name}")
            if pr_number:
                client.comment(int(pr_number), f"Tracking issue: GH-{number}")
        key = f"GH-{number}"
        created = today.isoformat() if today else ""
        tickets.append({
            "dir": task_name,
            "key": key,
            "meta": (
                f"issue: {number}\n"
                f"key: {key}\n"
                f"title: {_quote(task_title)}\n"
                f"task-type: {task_type}\n"
                f"created: {created}\n"
            ),
        })
    return tickets


def _quote(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def transition(client, number, step, body=None, pr_number=None):
    """Apply one step to issue `number`. Safe to run twice. Returns a short description."""
    if step not in STEPS:
        raise ValueError(f"unknown step {step!r} (expected one of {', '.join(STEPS)})")
    try:
        issue = client.get_issue(number)
    except NotFound:
        raise LookupError(f"Issue #{number} does not exist") from None

    labels = [label["name"] for label in issue.get("labels", [])]
    kept = [name for name in labels if name not in STATUS_LABELS]
    changes = []

    if step == "notMerged":
        client.comment(number, f"Spec PR #{pr_number} closed without merging." if pr_number else "Spec PR closed without merging.")
        return "commented: spec PR closed without merging"

    wanted = kept + [STEP_STATUS[step]] if step in STEP_STATUS else kept
    fields = {}
    if sorted(wanted) != sorted(labels):
        fields["labels"] = wanted
        changes.append(f"labels -> {', '.join(sorted(wanted)) or 'none'}")
    if step == "inProgress" and body is not None and body != issue.get("body"):
        fields["body"] = body
        changes.append("body replaced with the merged spec")
    if step == "done" and issue.get("state") != "closed":
        fields["state"] = "closed"
        fields["state_reason"] = "completed"
        changes.append("closed as completed")
    if fields:
        client.update_issue(number, **fields)
    if step == "done" and "state" in fields and pr_number:
        client.comment(number, f"Done in #{pr_number}.")
    return "; ".join(changes) or "no change"
