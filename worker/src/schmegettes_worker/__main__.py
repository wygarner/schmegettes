"""Entry point: `uv run python -m schmegettes_worker`.

Reads jobs from the pgmq queue "jobs" (envelope: shared/schemas/jobs/job.schema.json),
dispatches by `kind`, and deletes each message only after its handler succeeds. pgmq
redelivers a message whose visibility timeout expires, so every handler is idempotent.
"""

import os
import signal
import sys
import time

import structlog

log = structlog.get_logger(service="worker", env=os.environ.get("APP_ENV", "local"))


def main() -> int:
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.processors.JSONRenderer()])
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("worker started", commit=os.environ.get("GIT_SHA", "unknown"))
    # The queue loop is implemented by the first worker task (clue import). Until then the
    # process idles so the deploy and health checks can be exercised end to end.
    while not stopping:
        time.sleep(1)
    log.info("worker stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
