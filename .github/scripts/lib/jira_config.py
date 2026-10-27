"""
Reads .github/jira.json, the one file that holds the Jira project key,
issue-type IDs, and transition names.

The path is resolved from this file, not the working directory, because
create-jira-ticket.yml runs these scripts from a trusted checkout while the
working directory is the pull request's content.
"""

import json
import re
from pathlib import Path

_CONFIG_PATH = Path(__file__).resolve().parents[2] / "jira.json"

with _CONFIG_PATH.open() as f:
    CONFIG = json.load(f)

PROJECT_KEY = CONFIG["projectKey"]
ISSUE_TYPES = CONFIG["issueTypes"]
TRANSITIONS = CONFIG["transitions"]

if not re.fullmatch(r"[A-Z][A-Z0-9]+", PROJECT_KEY):
    raise SystemExit(f"jira.json: projectKey {PROJECT_KEY!r} is not a Jira project key")

# Matches a folder name that already carries a key, e.g. "buzzer-lockout-SCH-12".
KEYED_DIR = re.compile(rf"-{PROJECT_KEY}-\d+$")
