#!/usr/bin/env python3
"""
Moves a task issue through one step of the task-folder state machine.

Usage: transition-task-issue.py {N} {inProgress|inReview|done|notMerged}

  inProgress  status:in-progress; body replaced with the merged spec if SPEC_FILE is set
  inReview    status:in-review
  done        status labels removed; issue closed as completed
  notMerged   comment only: the spec PR was closed without merging

Each step is safe to run twice. A missing issue fails; this never creates one.

Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, PR_NUMBER (optional),
SPEC_FILE and SPEC_REF (optional, inProgress only: the merged task-brief.md,
read as data from the working directory, and the commit it is linked at).
"""

import os
import re
import sys
from pathlib import Path

from lib.github_client import GitHubClient
from lib.task_brief import BriefError, issue_body, read_brief
from lib.task_issues import STEPS, transition

if len(sys.argv) != 3 or not re.fullmatch(r"[0-9]+", sys.argv[1]) or sys.argv[2] not in STEPS:
    print(f"usage: transition-task-issue.py {{N}} {{{'|'.join(STEPS)}}}", file=sys.stderr)
    sys.exit(2)

number, step = int(sys.argv[1]), sys.argv[2]
pr_number = os.environ.get("PR_NUMBER") or None

body = None
spec_file = os.environ.get("SPEC_FILE", "").strip()
if step == "inProgress" and spec_file:
    path = Path(spec_file)
    if path.is_symlink() or not path.is_file():
        print(f"Task spec not found: {spec_file}", file=sys.stderr)
        sys.exit(1)
    # The marker names the folder without its key, as when the issue was created.
    task_name = re.sub(r"-GH-\d+$", "", path.parent.name)
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    link = f"{server}/{os.environ['GITHUB_REPOSITORY']}/blob/{os.environ['SPEC_REF']}/{spec_file}"
    try:
        _, _, spec = read_brief(path)
    except BriefError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    body = issue_body(task_name, spec, link)

try:
    result = transition(GitHubClient(), number, step, body=body, pr_number=pr_number)
except (LookupError, RuntimeError) as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
print(f"GH-{number} {step}: {result}")
