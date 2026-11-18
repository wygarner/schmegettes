"""Entry point: `uv run python -m schmegettes_worker [import-clues --seasons 1-40]`.

With no command, the worker process starts. It will read jobs from the pgmq queue "jobs"
(envelope: shared/schemas/jobs/job.schema.json); the queue loop is not built yet, so the
process idles so the deploy and health checks can be exercised end to end.

`import-clues` loads season files into the clue catalog and exits (clue_load.py). Locally:
`mise run clues:import -- --seasons 1-5`. Staging and production: the load-clues.yml workflow.
"""

import argparse
import os
import signal
import sys
import time

import psycopg
import structlog

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
    args = parser.parse_args(argv)

    if args.command == "import-clues":
        return import_clues(args.seasons)
    return run_worker()


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
