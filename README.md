# mountain-weather-tracker

An app to track hiking and ski touring locations. It aggregates weather from different websites, giving higher weight to local sources, so you can pick the best outing based on conditions.

## Getting started

```bash
just install
just dev
```

The dev server starts at `http://localhost:5173`.

## Justfile recipes

| Recipe | Description |
| --- | --- |
| `just dev` | Start the SvelteKit dev server |
| `just install` | Install dependencies |
| `just test` | Run tests |
| `just check` | Lint + typecheck + test |

## Parallel agents

Mode: github-issues — Label: `parallel`

```bash
# 1. Ask your agent to use the prepare-for-sandcastle prompt.
#    It will print gh issue create commands — run them.

# 2. Kick off parallel agents
./scripts/run-parallel.sh --from-issues --label parallel
```
