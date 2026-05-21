# ADR 0003: SQLite + Drizzle ORM for persistence

## Status

Accepted

## Context

The app is a single-user personal tool running on one machine. Data to persist: Areas, Key Points, Outings, Source weights, cached Forecasts. No multi-user or cross-device requirements at this stage.

## Decision

Use SQLite as the database and Drizzle ORM for type-safe queries. The database is a single file on the local machine.

## Consequences

- Zero infrastructure — no database server to run or manage
- Trivially backed up (copy one file)
- Drizzle provides type-safe schema and query layer that integrates cleanly with SvelteKit server routes
- Migrating to Postgres later is straightforward — Drizzle supports both dialects
