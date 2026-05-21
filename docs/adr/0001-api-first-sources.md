# ADR 0001: API-first weather source strategy

## Status

Accepted

## Context

Several high-quality mountain weather services (e.g. mountain-forecast.com) lack public APIs and would require scraping. Scraping is brittle, legally grey, and adds ongoing maintenance burden. A set of solid, free public APIs already covers the core need: Open-Meteo (global, free, mountain-capable), yr.no (free API, good Nordic/Alpine coverage), Meteoblue (paid tier, strong mountain model).

## Decision

Start with API-based Sources only. Design the Source abstraction as an interface so scraping adapters can be added later without touching the aggregation or weighting logic.

## Consequences

- Fewer sources available at launch, but the ones included are reliable and low-maintenance
- Scraping infrastructure is not built on day one — reduces scope significantly
- Scraping adapters can be plugged in later as the Source interface is stable
