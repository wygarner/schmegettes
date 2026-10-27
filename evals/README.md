# Evals

Eval harness for LLM features (first: the appeal judge in `worker/`). Prompts live in `worker/prompts/`. Cases are JSONL files here, with a graded expected verdict for each player answer and correct response.

Not built yet: the CI `evals` job runs (non-blocking) once `evals/pyproject.toml` exists.
