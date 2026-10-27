"""
Jira REST API v3 client (standard library only).

Auth is HTTP Basic with base64(email:token), from JIRA_URL, JIRA_EMAIL and
JIRA_API_TOKEN.
"""

import base64
import json
import os
import urllib.request

JIRA_URL = os.environ["JIRA_URL"].rstrip("/")
JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_API_TOKEN = os.environ["JIRA_API_TOKEN"]


def _auth_header():
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    return f"Basic {creds}"


def jira_request(method, path, body=None):
    req = urllib.request.Request(
        f"{JIRA_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": _auth_header(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def jira_post(path, body):
    return jira_request("POST", path, body)


def jira_put(path, body):
    return jira_request("PUT", path, body)


def jira_get(path):
    return jira_request("GET", path)
