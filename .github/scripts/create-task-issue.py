#!/usr/bin/env python3
"""
Creates the tracking issue for a task spec and reports its key, so the
workflow's commit job can write .task-meta.yml and rename the task folder to
tasks/{task-name}-GH-{N}/.

create-task-issue.yml runs this script from a checkout of the pull request's
base branch, with the pull request's head checked out as the working
directory. The paths in CHANGED_FILES are read from the working directory as
data only: this script holds a token that can write issues, so it must not
import or execute anything from the working directory, and it does not write
to it.

Expected frontmatter in task-brief.md:
---
task-type: new-feature   # new-feature | enhancement | improvement | bug-fix
task-title: "Brief task title"
---

Re-running on the same spec reuses the issue it created (found by the
<!-- task-folder: … --> marker in the body), so no duplicate is made.

Env: GITHUB_TOKEN, GITHUB_REPOSITORY, CHANGED_FILES (newline-separated),
SPEC_REF (commit the spec link points at), PR_NUMBER (optional),
GITHUB_SERVER_URL, GITHUB_OUTPUT.
"""

import json
import os
import sys
from datetime import date

from lib.github_client import GitHubClient
from lib.task_brief import BriefError
from lib.task_issues import create_issues

repo = os.environ["GITHUB_REPOSITORY"]
server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
ref = os.environ["SPEC_REF"]


def link_for(filepath):
    return f"{server}/{repo}/blob/{ref}/{filepath}"


try:
    tickets = create_issues(
        GitHubClient(),
        os.environ.get("CHANGED_FILES", "").splitlines(),
        link_for,
        pr_number=os.environ.get("PR_NUMBER") or None,
        today=date.today(),
    )
except (BriefError, RuntimeError) as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)

# Read by the commit job, which writes each `meta` to tasks/{dir}/.task-meta.yml
# and renames the folder to tasks/{dir}-{key}.
with open(os.environ.get("GITHUB_OUTPUT", "/dev/stdout"), "a") as f:
    f.write(f"tickets={json.dumps(tickets)}\n")
