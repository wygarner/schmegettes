#!/usr/bin/env python3
"""
Moves a Jira ticket through one named transition.

Usage: transition-jira.py {KEY} {inProgress|inReview|done}

The transition name comes from .github/jira.json. The script fetches the
ticket's available transitions and matches by exact name; if none matches
from the ticket's current status it logs a skip and exits 0.

Env: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN.
"""

import re
import sys
import urllib.error

from lib.jira_client import jira_get, jira_post
from lib.jira_config import PROJECT_KEY, TRANSITIONS

if len(sys.argv) != 3 or sys.argv[2] not in TRANSITIONS:
    print(f"usage: transition-jira.py {{KEY}} {{{'|'.join(TRANSITIONS)}}}", file=sys.stderr)
    sys.exit(2)

key, step = sys.argv[1], sys.argv[2]
if not re.fullmatch(rf"{PROJECT_KEY}-\d+", key):
    print(f"Refusing unexpected key {key!r}", file=sys.stderr)
    sys.exit(1)

name = TRANSITIONS[step]

try:
    available = jira_get(f"/rest/api/3/issue/{key}/transitions").get("transitions", [])
    match = next((t["id"] for t in available if t["name"] == name), None)
    if not match:
        names = ", ".join(t["name"] for t in available) or "none"
        print(f"No '{name}' transition available for {key} (available: {names}); skipping")
        sys.exit(0)
    jira_post(f"/rest/api/3/issue/{key}/transitions", {"transition": {"id": match}})
    print(f"Transitioned {key} to {name}")
except urllib.error.HTTPError as e:
    print(f"Jira API error for {key}: {e.code} {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
