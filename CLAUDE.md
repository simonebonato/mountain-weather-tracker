# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mountain Weather Tracker — an app to track hiking and ski touring locations by aggregating weather from multiple sources, giving higher weight to local/regional weather sites. Users can compare locations to pick the best hike based on conditions.

## Commands

This project uses Bun (see root CLAUDE.md). Once the project is built out:

```sh
bun install          # install dependencies
bun run dev          # start dev server
bun test             # run tests
bun run typecheck    # type-check without emitting
```

The `.sandcastle/implement-prompt.md` workflow calls `npm run typecheck` and `npm run test` before committing — keep those scripts in `package.json` when one is created.

## Sandcastle Automation

`.sandcastle/` contains a multi-agent CI loop powered by `@ai-hero/sandcastle`:

- **`main.mts`** — orchestrator. Run with `npx tsx .sandcastle/main.mts`. Loops up to 10 times: Plan → Execute+Review → Merge.
- **`plan-prompt.md`** — planner agent: reads open GitHub issues labeled `Sandcastle`, builds a dependency graph, outputs unblocked issues as `<plan>` JSON.
- **`implement-prompt.md`** — implementer agent: fixes a single issue using Red-Green-Refactor, commits with `RALPH:` prefix.
- **`review-prompt.md`** — reviewer agent: reviews the branch after implementation.
- **`merge-prompt.md`** — merger agent: merges completed branches into main.

To trigger the automation, issues must be labeled `Sandcastle` on GitHub. The planner assigns branches named `sandcastle/issue-{id}-{slug}`.

## Architecture Notes

No application code exists yet. When building it out:

- Use `Bun.serve()` with HTML imports for the frontend (no Vite/Express).
- Weather aggregation logic should weight sources by geographic proximity to the queried location.
- Keep weather-source adapters in separate modules so new sources can be added without touching core logic.
