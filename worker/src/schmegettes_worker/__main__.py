"""Entry point: `uv run python -m schmegettes_worker [import-clues --seasons 1-40 | rate-clues]`.

With no command, the worker process starts. It will read jobs from the pgmq queue "jobs"
(envelope: shared/schemas/jobs/job.schema.json); the queue loop is not built yet, so the
process idles so the deploy and health checks can be exercised end to end.

`import-clues` loads season files into the clue catalog and exits (clue_load.py). Locally:
`mise run clues:import -- --seasons 1-5`. Staging and production: the load-clues.yml workflow.

`rate-clues` labels the catalog's categories Easy, Medium or Hard with Claude and exits
(clue_rate.py). Locally: `mise run clues:rate`. Staging and production: the rate-clues.yml workflow.
Its options run the quality gate instead: `--check-order N`, `--handcheck-export PATH`,
`--handcheck-score PATH`.
"""

import argparse
import os
import signal
import sys
import time
from pathlib import Path

import psycopg
import structlog

from . import clue_rate
from .clue_load import (
    DEFAULT_SEASONS,
    PgStore,
    PrivateAccessNotLive,
    http_fetch,
    load_seasons,
    parse_seasons,
    render_summary,
)

log = structlog.get_logger(service="worker", env=os.environ.get("APP_ENV", "local"))


def main(argv: list[str] | None = None) -> int:
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.processors.JSONRenderer()])
    parser = argparse.ArgumentParser(prog="schmegettes_worker")
    commands = parser.add_subparsers(dest="command")
    imports = commands.add_parser("import-clues", help="Load clue dataset seasons into public.clues")
    imports.add_argument("--seasons", default=DEFAULT_SEASONS, help="Seasons to load, e.g. 1-40 or 1-5,12")
    rates = commands.add_parser("rate-clues", help="Label catalog categories Easy, Medium or Hard with Claude")
    mode = rates.add_mutually_exclusive_group()
    mode.add_argument("--limit", type=_positive, help="Rate at most this many categories (a pilot)")
    mode.add_argument(
        "--check-order", type=_positive, metavar="N", help="Quality gate: score the clues of N categories"
    )
    mode.add_argument("--handcheck-export", type=Path, metavar="PATH", help="Quality gate: write the 60-category sheet")
    mode.add_argument("--handcheck-score", type=Path, metavar="PATH", help="Quality gate: compare a filled-in sheet")
    args = parser.parse_args(argv)

    if args.command == "import-clues":
        return import_clues(args.seasons)
    if args.command == "rate-clues":
        return rate_clues(args)
    return run_worker()


def _positive(value: str) -> int:
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("must be 1 or more")
    return n


def rate_clues(args: argparse.Namespace) -> int:
    owner_url = os.environ.get("DATABASE_OWNER_URL")
    if not owner_url:
        print("DATABASE_OWNER_URL must be set", file=sys.stderr)
        return 2
    model = os.environ.get("DIFFICULTY_MODEL") or clue_rate.DEFAULT_MODEL
    needs_claude = args.handcheck_export is None and args.handcheck_score is None
    if needs_claude and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY must be set", file=sys.stderr)
        return 2

    with psycopg.connect(owner_url, autocommit=True) as conn:
        store = clue_rate.PgStore(conn)
        if args.handcheck_export is not None:
            per_level = [c for level in clue_rate.LEVELS for c in store.sample(20, level)]
            if len(per_level) < 60:
                print("Not enough labelled categories for the hand check: rate the catalog first.", file=sys.stderr)
                return 1
            clue_rate.write_handcheck(per_level, args.handcheck_export)
            print(f"Wrote {len(per_level)} categories to {args.handcheck_export}: fill in my_label for each.")
            return 0
        if args.handcheck_score is not None:
            try:
                hand = clue_rate.read_handcheck(args.handcheck_score)
                check = clue_rate.score_handcheck(hand, store.labels(list(hand)))
            except ValueError as err:
                print(str(err), file=sys.stderr)
                return 2
            print(clue_rate.render_handcheck(check))
            return 0 if check.passed else 1

        import anthropic

        client = clue_rate.AnthropicBatches(anthropic.Anthropic(), model, clue_rate.PROMPT_PATH.read_text("utf-8"))
        if args.check_order is not None:
            sample = store.sample(args.check_order)
            if not sample:
                print("No labelled board categories to check: rate the catalog first.", file=sys.stderr)
                return 1
            order = clue_rate.check_order(sample, client)
            print(clue_rate.render_order_check(order))
            return 0 if order.passed else 1

        report = clue_rate.rate(store, client, model=model, limit=args.limit)
    print(clue_rate.render_report(report, model))
    return 0 if not report.failed else 1


def import_clues(seasons_spec: str) -> int:
    try:
        seasons = parse_seasons(seasons_spec)
    except ValueError as err:
        print(f"--seasons: {err}", file=sys.stderr)
        return 2
    owner_url = os.environ.get("DATABASE_OWNER_URL")
    base_url = os.environ.get("CLUE_DATASET_BASE_URL")
    if not owner_url or not base_url:
        print("DATABASE_OWNER_URL and CLUE_DATASET_BASE_URL must be set", file=sys.stderr)
        return 2

    env = os.environ.get("APP_ENV", "local")
    with psycopg.connect(owner_url, autocommit=True) as conn:
        try:
            results = load_seasons(seasons, fetch=http_fetch(base_url), store=PgStore(conn), env=env)
        except PrivateAccessNotLive:
            log.error("clue import refused", reason="private access is not live")
            print("Refused: private access is not live in this database (no public.hosts).", file=sys.stderr)
            return 2
    print(render_summary(results))
    return 0 if all(r.ok for r in results) else 1


def run_worker() -> int:
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("worker started", commit=os.environ.get("GIT_SHA", "unknown"))
    while not stopping:
        time.sleep(1)
    log.info("worker stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
