#!/usr/bin/env python3
"""
Creates a Jira ticket from task-brief.md frontmatter and reports the assigned
key, so the workflow's commit job can write .jira-meta.yml and rename the task
folder.

create-jira-ticket.yml runs this script from a checkout of the pull request's
base branch, with the pull request's head checked out as the working directory.
The paths in CHANGED_FILES are read from the working directory as data only:
this script holds the Jira credentials, so it must not import or execute
anything from the working directory, and it does not write to it.

Expected frontmatter in task-brief.md:
---
jira-type: new-feature   # new-feature | enhancement | improvement | bug-fix
jira-title: "Brief task title"
---

Skips files whose folder already has a .jira-meta.yml or a key suffix. Any
other file must be tasks/{task-name}/task-brief.md with a task-name matching
TASK_NAME_PATTERN, or the run fails before any ticket is created.

Tickets get no fixVersion: releases are tracked only in releases/X.Y.Z/.
"""

import json
import os
import re
import sys
import urllib.error
from datetime import date
from pathlib import Path

from lib.jira_client import jira_post
from lib.jira_config import ISSUE_TYPES, KEYED_DIR, PROJECT_KEY
from lib.markdown_adf import extract_brief_body, markdown_to_adf, parse_frontmatter

CHANGED_FILES = os.environ.get("CHANGED_FILES", "").splitlines()

# The commit job puts the task-name into a path and a `git mv`, and checks it
# against the same pattern again before it does.
TASK_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")

# Jira rejects descriptions over its size limit; fail with a clear message instead.
MAX_BRIEF_CHARS = 30000


def create_ticket(title, jira_type, description_nodes):
    config = ISSUE_TYPES.get(jira_type)
    if not config:
        print(f"  Unknown jira-type: {jira_type!r} (expected one of {sorted(ISSUE_TYPES)})", file=sys.stderr)
        return None
    if not config["issuetypeId"].isdigit():
        print(f"  .github/jira.json has no issue-type ID for {jira_type!r}", file=sys.stderr)
        return None

    fields = {
        "project": {"key": PROJECT_KEY},
        "summary": title,
        "issuetype": {"id": config["issuetypeId"]},
        "labels": [config["label"]],
        "description": {"version": 1, "type": "doc", "content": description_nodes},
    }

    try:
        result = jira_post("/rest/api/3/issue", {"fields": fields})
        return result["key"]
    except urllib.error.HTTPError as e:
        print(f"  Jira API error: {e.read().decode()}", file=sys.stderr)
        return None


def find_briefs():
    """Return the (filepath, task directory) pairs that need a ticket."""
    root = Path.cwd().resolve()
    briefs = []

    for filepath in CHANGED_FILES:
        filepath = filepath.strip()
        if not filepath:
            continue

        path = Path(filepath)
        if path.name != "task-brief.md":
            continue

        dirpath = path.parent
        if KEYED_DIR.search(dirpath.name):
            print(f"Skipping {filepath}: folder already has a Jira key")
            continue

        if (
            path.is_absolute()
            or len(path.parts) != 3
            or path.parts[0] != "tasks"
            or not TASK_NAME_PATTERN.fullmatch(dirpath.name)
        ):
            print(
                f"Refusing {filepath!r}: expected tasks/{{task-name}}/task-brief.md "
                f"with a task-name matching {TASK_NAME_PATTERN.pattern}",
                file=sys.stderr,
            )
            sys.exit(1)

        # A symlink could point the brief at a file outside the repository.
        if path.is_symlink() or dirpath.is_symlink() or root not in path.resolve().parents:
            print(f"Refusing {filepath!r}: not a regular file inside the repository", file=sys.stderr)
            sys.exit(1)

        meta_path = dirpath / ".jira-meta.yml"
        if meta_path.exists() or meta_path.is_symlink():
            print(f"Skipping {filepath}: .jira-meta.yml already exists")
            continue

        briefs.append((filepath, dirpath))

    return briefs


tickets = []
briefs = find_briefs()

# One ticket per spec PR: only the first brief is processed.
if len(briefs) > 1:
    print(f"Found {len(briefs)} task briefs; only the first ({briefs[0][0]}) gets a ticket.")
    briefs = briefs[:1]

for filepath, dirpath in briefs:
    fm = parse_frontmatter(filepath)
    if not fm:
        print(f"Skipping {filepath}: no frontmatter found")
        continue

    jira_type = fm.get("jira-type")
    jira_title = fm.get("jira-title")
    if not jira_type or not jira_title:
        print(f"Skipping {filepath}: missing jira-type or jira-title in frontmatter")
        continue

    brief_body = extract_brief_body(filepath)
    if len(brief_body) > MAX_BRIEF_CHARS:
        print(f"{filepath} is {len(brief_body)} characters; Jira's limit is about {MAX_BRIEF_CHARS}. Shorten it.", file=sys.stderr)
        sys.exit(1)

    print(f"Creating Jira ticket for {filepath} ({jira_type}: {jira_title!r})")
    key = create_ticket(jira_title, jira_type, markdown_to_adf(brief_body))
    if not key:
        print(f"  Failed to create ticket for {filepath}", file=sys.stderr)
        sys.exit(1)

    tickets.append({
        "dir": dirpath.name,
        "key": key,
        "meta": (
            f"jira-key: {key}\n"
            f"title: {json.dumps(jira_title)}\n"
            f"task-type: {jira_type}\n"
            f"created: {date.today().isoformat()}\n"
        ),
    })
    print(f"  Created {key} for tasks/{dirpath.name}")

# Read by the commit job, which writes each `meta` to
# tasks/{dir}/.jira-meta.yml and renames the folder to tasks/{dir}-{key}.
with open(os.environ.get("GITHUB_OUTPUT", "/dev/stdout"), "a") as f:
    f.write(f"tickets={json.dumps(tickets)}\n")
