#!/usr/bin/env python3
"""
Replaces a Jira ticket's description with the merged task-brief.md body.

Runs when a task-spec PR merges (jira-transitions.yml, In Progress). Picks up
edits made after ticket creation, such as the branch table. The task folder is
deleted by the implementation PR, so this is the last write to the
description.

Env: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, CHANGED_FILES (newline-separated),
JIRA_KEY.
"""

import os
import sys
import urllib.error
from pathlib import Path

from lib.jira_client import jira_put
from lib.jira_config import KEYED_DIR
from lib.markdown_adf import extract_brief_body, markdown_to_adf

CHANGED_FILES = os.environ.get("CHANGED_FILES", "").splitlines()
JIRA_KEY = os.environ.get("JIRA_KEY", "")

if not JIRA_KEY:
    print("No JIRA_KEY provided; skipping", file=sys.stderr)
    sys.exit(0)

spec_path = next(
    (
        f.strip()
        for f in CHANGED_FILES
        if Path(f.strip()).name == "task-brief.md" and KEYED_DIR.search(Path(f.strip()).parent.name)
    ),
    None,
)

if not spec_path:
    print(f"No task spec in the changed files for {JIRA_KEY}; skipping")
    sys.exit(0)
if not Path(spec_path).exists():
    print(f"Task spec not found: {spec_path}", file=sys.stderr)
    sys.exit(1)

body = {
    "fields": {
        "description": {
            "version": 1,
            "type": "doc",
            "content": markdown_to_adf(extract_brief_body(spec_path)),
        }
    }
}

try:
    jira_put(f"/rest/api/3/issue/{JIRA_KEY}", body)
    print(f"Updated description for {JIRA_KEY} from {spec_path}")
except urllib.error.HTTPError as e:
    print(f"Jira API error updating {JIRA_KEY}: {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
