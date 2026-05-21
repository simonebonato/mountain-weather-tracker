# ADR 0002: SvelteKit as the web framework

## Status

Accepted

## Context

The app is a personal web tool. The UI is data-heavy (ranked cards, expandable forecasts, day-by-day breakdowns) but built by one person. Needed: minimal boilerplate, fast output, good developer experience.

## Decision

Use SvelteKit. It covers both frontend reactivity and server-side API routes in one framework, avoiding the need for a separate backend service at this scale.

## Consequences

- No separate backend process needed — SvelteKit server routes handle weather API calls server-side (keeps API keys off the client)
- Lean bundle size, fast initial load
- Smaller ecosystem than React, but sufficient for this scope
