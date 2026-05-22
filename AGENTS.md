# Project instructions

## Commands

- Install: `just install`
- Test: `just test`
- Lint: `just lint`
- Typecheck: `just typecheck`
- Full check: `just check`

## Project conventions

- Follow existing patterns.
- Keep changes small.
- Do not touch unrelated files.
- Run checks before finishing.
- Explain risks in PRs.

## Parallel agents

Mode: github-issues
Label: parallel

## Architecture notes

- [Add only factual project-specific notes here.]
- Agent skill metadata for this dotfiles repo is recorded in `docs/agents/skill-metadata.md`.

## Creating parallel issues

Issues labeled `parallel` must use the task block format below. The runner will reject any issue body that contains prose before the first `## Task:` heading.

```
## Task: <short imperative heading>

TASK: <one-sentence summary of what to implement>
FILES: <comma-separated exact file paths the agent may edit>
DO NOT TOUCH: <comma-separated exact file paths, or 'none'>
CHECK: <single literal runnable command>
DONE WHEN:
- <acceptance criterion>
- <acceptance criterion>
```

Rules:
- Every field is required. Omitting any field causes the runner to reject the issue.
- `FILES` and `DO NOT TOUCH` must be exact paths — no globs.
- `CHECK` must be a literal runnable command (e.g. `just test`), not prose (e.g. "run the tests").
- One task per issue. Multiple independent tasks get separate issues.

## Parallel task contract

When working from `tasks.md`, only accept tasks that contain all required fields:

- TASK
- FILES
- DO NOT TOUCH
- CHECK
- DONE WHEN

Treat `FILES` as a strict edit allowlist for exact paths. Read other files as needed for context, but do not edit files outside `FILES`.

Do not edit files listed under `DO NOT TOUCH`.

Run the command listed under `CHECK` before finishing.

If the task is missing required fields, is ambiguous, would require editing outside `FILES`, or would require touching forbidden files, stop and report the reason instead of guessing.

Path enforcement is exact-path only for now. Do not use globs in `FILES` or `DO NOT TOUCH` until the runner explicitly supports them.
