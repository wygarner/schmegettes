"""
Shared markdown -> Atlassian Document Format (ADF) conversion helpers.

Used by create-jira-task-docs.py (initial ticket creation) and
update-jira-task-spec.py (description refresh on task-brief PR merge) so
both scripts render task-brief.md / product-brief.md content identically.
"""

import re
from pathlib import Path


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


def strip_md_inline(s):
    """Strip common inline markdown formatting to plain text."""
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)           # bold
    s = re.sub(r'\*(.+?)\*', r'\1', s)                # italic
    s = re.sub(r'`(.+?)`', r'\1', s)                  # inline code
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)    # links
    return s.strip()


def _split_table_row(line):
    """Split a `|`-delimited markdown table row into cell texts."""
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_table_separator_row(line):
    """True if line is a `|---|:---:|---:|`-style header separator row."""
    stripped = line.strip()
    if "|" not in stripped:
        return False
    cells = _split_table_row(stripped)
    return bool(cells) and all(re.match(r'^:?-+:?$', c) for c in cells)


def markdown_to_adf(text):
    """Convert simplified markdown to Atlassian Document Format content nodes."""
    nodes = []
    lines = text.splitlines()

    list_type = None    # "bullet" or "ordered"
    list_items = []
    in_code_block = False

    def flush_list():
        nonlocal list_type, list_items
        if list_items:
            adf_type = "bulletList" if list_type == "bullet" else "orderedList"
            nodes.append({"type": adf_type, "content": list_items[:]})
        list_type = None
        list_items.clear()

    def table_cell(text_content, header=False):
        content = [{"type": "text", "text": text_content}] if text_content else []
        return {
            "type": "tableHeader" if header else "tableCell",
            "content": [{"type": "paragraph", "content": content}],
        }

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Code fence toggle — skip contents
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            i += 1
            continue
        if in_code_block:
            i += 1
            continue

        # Table: a `|`-delimited row followed by a `|---|...` separator row
        if stripped.startswith("|") and i + 1 < n and _is_table_separator_row(lines[i + 1]):
            flush_list()
            header_cells = _split_table_row(line)
            table_rows = [{
                "type": "tableRow",
                "content": [table_cell(strip_md_inline(c), header=True) for c in header_cells],
            }]
            i += 2  # skip header row + separator row
            while i < n and lines[i].strip().startswith("|"):
                data_cells = _split_table_row(lines[i])
                table_rows.append({
                    "type": "tableRow",
                    "content": [table_cell(strip_md_inline(c)) for c in data_cells],
                })
                i += 1
            nodes.append({"type": "table", "content": table_rows})
            continue

        # H1 — skip (already used as the Jira summary)
        if line.startswith("# ") and not line.startswith("## "):
            i += 1
            continue

        # H2
        if line.startswith("## "):
            flush_list()
            nodes.append({
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": strip_md_inline(line[3:])}],
            })
            i += 1
            continue

        # H3
        if line.startswith("### "):
            flush_list()
            nodes.append({
                "type": "heading",
                "attrs": {"level": 3},
                "content": [{"type": "text", "text": strip_md_inline(line[4:])}],
            })
            i += 1
            continue

        # Separator or empty line
        if not stripped or stripped == "---":
            flush_list()
            i += 1
            continue

        # Bullet list item (including checkbox variants: - [ ] and - [x])
        bullet_match = re.match(r'^[-*]\s+(?:\[.\]\s+)?(.*)', line)
        if bullet_match:
            if list_type == "ordered":
                flush_list()
            list_type = "bullet"
            list_items.append({
                "type": "listItem",
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": strip_md_inline(bullet_match.group(1))}
                ]}],
            })
            i += 1
            continue

        # Ordered list item
        ordered_match = re.match(r'^\d+\.\s+(.*)', line)
        if ordered_match:
            if list_type == "bullet":
                flush_list()
            list_type = "ordered"
            list_items.append({
                "type": "listItem",
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": strip_md_inline(ordered_match.group(1))}
                ]}],
            })
            i += 1
            continue

        # Regular paragraph
        flush_list()
        text_content = strip_md_inline(line)
        if text_content:
            nodes.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": text_content}],
            })
        i += 1

    flush_list()

    if not nodes:
        nodes.append({
            "type": "paragraph",
            "content": [{"type": "text", "text": "See product brief for details."}],
        })

    return nodes
