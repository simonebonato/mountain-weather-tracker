# PRD: Mountain Weather Tracker

## Problem Statement

Planning a mountain outing requires checking multiple weather forecast websites manually — each visit for each candidate area, repeated across 3–5 websites per location. When choosing between multiple candidate areas for a weekend, this means a large matrix of manual checks before being able to make an informed decision. Local and domain-specialist forecasts (national alpine services, ski-specific sites) are often more accurate but harder to aggregate by hand. The result is either wasted time or under-informed decisions about where to go.

## Solution

A personal web app that tracks weather across multiple mountain Areas simultaneously. The user defines candidate Outings (Area + Activity + date range), and the app fetches forecasts from multiple weighted Sources, aggregates them into a Weather Summary (Verdict + Confidence Range), and presents Outings ranked best-to-worst on a single dashboard. The user can open the app, scan the ranked list, and pick a destination in seconds rather than minutes.

## User Stories

1. As a mountaineer, I want to create an Area from a GPX file, so that the app automatically extracts the relevant key geographic points (start, summit, end) with their elevations.
2. As a mountaineer, I want to create an Area by typing a city name and specifying I want mountain conditions, so that I can add locations without a GPX track.
3. As a mountaineer, I want to create an Area from a Komoot or O-Trails link, so that I can reuse routes I already have on those platforms.
4. As a mountaineer, I want each Area to store 1–5 Key Points (lat/long + elevation), so that weather is fetched at the relevant elevations rather than just the valley.
5. As a mountaineer, I want to create an Outing by combining an Area, an Activity, and a date range, so that the weather analysis is tailored to what I'm actually planning.
6. As a mountaineer, I want to tag an Outing as one of: hiking, snowshoeing, skiing, ski touring, or via ferrata, so that the Verdict reflects what actually matters for that activity.
7. As a mountaineer, I want to reuse the same Area for different Activities across different Outings, so that I don't have to re-enter geographic data.
8. As a mountaineer, I want to see all my active Outings ranked from best to worst weather conditions on a single dashboard, so that I can choose a destination at a glance.
9. As a mountaineer, I want each Outing card to show a Verdict (Good / Uncertain / Bad) and 2–3 key weather numbers, so that I can scan quickly without reading details.
10. As a mountaineer, I want to expand an Outing card to see the full Confidence Range for each weather variable, so that I can understand how much sources agree or disagree.
11. As a mountaineer, I want multi-day Outings to show a per-day Verdict for each day in the range, so that I can identify which day of a trip is the weak link.
12. As a mountaineer, I want multi-day Outings to show a trip-level Verdict derived from the worst day, so that I can assess whether the overall trip is viable.
13. As a mountaineer, I want the Verdict for a via ferrata Outing to be automatically set to Bad if thunderstorm probability is elevated, regardless of other variables, so that I'm never misled into a dangerous situation.
14. As a mountaineer, I want ski and snowshoe Outings to surface snow depth and freeze level in addition to the base weather variables, so that I can assess snow conditions.
15. As a mountaineer, I want ski touring Outings to surface wind speed above a defined threshold and an avalanche risk signal, so that I can assess safety beyond just the weather.
16. As a mountaineer, I want weather to be fetched from multiple Sources simultaneously, so that the app can aggregate a more reliable picture than any single forecast.
17. As a mountaineer, I want each Source to be weighted by how geographically relevant it is to the Area (e.g. MeteoSvizzera for Swiss Alps), so that local services have more influence on the Verdict.
18. As a mountaineer, I want each Source to be weighted by whether it specialises in mountain or snow/ski conditions, so that domain-specialist forecasts count more.
19. As a mountaineer, I want to optionally set a manual reliability score (1–5) for any Source based on my experience, so that I can tune the weights to match reality.
20. As a mountaineer, I want a Confidence Range that shows the spread across Sources for each variable, so that I can tell when sources strongly disagree (high uncertainty).
21. As a mountaineer, I want weather data to be cached for 6 hours, so that the app loads fast even when I have many Outings.
22. As a mountaineer, I want each Outing card to show a "last updated at HH:MM" label, so that I know how fresh the data is.
23. As a mountaineer, I want stale forecasts to refresh in the background when I open the app, so that I always see fresh data without waiting.
24. As a mountaineer, I want a manual refresh button, so that I can force a fetch outside the 6-hour window when I know a forecast has been updated.
25. As a mountaineer, I want to see a 7-day default forecast horizon, so that I can plan for the coming week.
26. As a mountaineer, I want to see forecasts for days 8–14 in a visually dimmed "low confidence" state, so that I have a rough read on the following week while understanding it's unreliable.
27. As a mountaineer, I want Outing cards to show a badge when the Verdict has changed since my last visit, so that I'm alerted to significant condition changes without needing a notification.
28. As a mountaineer, I want to delete an Outing when a trip is over or cancelled, so that the dashboard stays clean.
29. As a mountaineer, I want to edit an Outing's date range, so that I can adjust plans without recreating the Outing from scratch.
30. As a mountaineer, I want the app to run without any login or account, so that I can open it instantly without friction.

## Implementation Decisions

### Module breakdown

**1. Area Ingestion module**
Accepts three input types and produces a canonical Area with 1–5 Key Points:

- GPX file → parse track, extract start/summit/end points with elevations
- City name query → geocode, then query a terrain elevation API for the mountain elevation band
- Hiking app URL (Komoot, O-Trails) → fetch route metadata, reduce to GPX-equivalent, then same as GPX

Interface: `ingest(input) → Area`. Each input type is a separate adapter behind this interface. This is a deep module — rich internal logic, simple external contract, no I/O leaking out.

**2. Source Adapter module**
Each weather API is one adapter implementing a common interface: `fetch(keyPoint: KeyPoint, dateRange: DateRange) → Forecast`.

Initial adapters: Open-Meteo (free, no key required, strong mountain data) and yr.no (free API). Meteoblue may be added as a paid option. The interface is designed so scraping-based adapters can be added later without changing the aggregation layer.

Adapters must request and normalize forecast data for days 1–14 when the provider supports that range. The normalized daily forecast includes a 1-based `dayIndex` and `confidenceTier`:

- `normal` for days 1–7
- `low` for days 8–14

The 14-day horizon is a hard product cap. Data beyond day 14 is discarded even if a Source returns it.

**3. Aggregation Engine**
Pure function with no I/O: `aggregate(forecasts: Forecast[], sourceWeights: WeightMap, activity: Activity) → WeatherSummary`.

Produces per-variable statistics: weighted mean and spread (confidence range) across all Sources. The spread is the primary input to Confidence Range. This module is the most important to get right — it must be fully testable without network or database.

The extended-horizon `low` confidence tier is display metadata, not a Source weight. It must not change the weighted mean, Confidence Range, or Verdict rules for a given day.

**4. Verdict Engine**
Pure function: `computeVerdict(summary: WeatherSummary, activity: Activity) → Verdict`.

Activity-aware rules:

- All activities: base verdict from precipitation, wind, temperature, visibility
- Via ferrata: if thunderstorm probability exceeds threshold → hard Bad, overrides all other signals
- Skiing / Snowshoeing: additionally checks snow depth and freeze level
- Ski touring: additionally checks wind above threshold and avalanche risk signal

**5. Forecast Cache**
SQLite-backed. Interface: `get(keyPoint, date) → CachedForecast | null`, `set(keyPoint, forecast, fetchedAt)`. Returns null if the cached entry is older than 6 hours. The cache is keyed on Source + Key Point + date.

**6. Background Refresh**
SvelteKit server hook (or `+page.server.ts` load function). On each dashboard load, checks cache freshness for all Key Points of all active Outings. Enqueues fetches for stale entries and returns immediately with cached data. The UI updates incrementally as fresh data arrives.

**7. Comparison View**
SvelteKit `+page.svelte`. Fetches all active Outings, runs Aggregation + Verdict per Outing, renders a ranked list (best Verdict first). Each card: compact by default (Verdict badge + 2–3 key numbers + last-updated label + change badge if Verdict changed). Expandable to full Confidence Range + per-day breakdown.

Collapsed cards show only days 1–7. Expanded cards show the full days 1–14 breakdown. Days 8–14 must be visually dimmed and carry a visible "low confidence" label; dimming must not be the only signal.

### Source weighting formula

`finalWeight = geographicMatchScore × domainSpecialtyScore × (userReliabilityScore ?? 1)`

- `geographicMatchScore`: 0.5–1.0, computed from the country/region of the Area vs. the Source's coverage area
- `domainSpecialtyScore`: 1.0 for generic services, 1.3–1.5 for mountain/snow-specialist services
- `userReliabilityScore`: optional 1–5 user input, normalised to 0.2–1.0 multiplier

### Database schema (conceptual)

Tables: `areas`, `key_points`, `outings`, `sources`, `forecasts` (cache), `verdict_snapshots` (for change badge).

`verdict_snapshots` records the last Verdict seen per Outing per user session — used to compute whether a badge should be shown.

### Stack

- SvelteKit (frontend + server routes — API keys never reach the client)
- SQLite via Drizzle ORM
- No authentication, no accounts
- Single-machine deployment (dev server or `node build`)

## Testing Decisions

Good tests assert external behaviour through the module's public interface, not implementation details. They do not mock internal collaborators — only true external I/O (network, database) is replaced with test doubles.

**Modules to test:**

- **Area Ingestion** — unit tests per adapter (GPX parsing, city query resolution, URL adapter). Input: fixture files and mock HTTP responses. Assert: correct number of Key Points, correct elevation extraction, correct fallback when elevation is unavailable.
- **Aggregation Engine** — unit tests with synthetic Forecast arrays and weight maps. Assert: correct weighted means, correct spread/confidence computation, correct behaviour with one source vs. many, correct behaviour when sources disagree maximally.
- **Verdict Engine** — unit tests per Activity rule. Assert: via ferrata hard blocker fires correctly, threshold crossings produce the right Verdict, edge cases at boundary values.
- **Forecast Cache** — integration tests against a real SQLite in-memory database. Assert: cache miss returns null, cache hit within TTL returns data, stale entry returns null, set+get roundtrip is correct.

Source adapters are not unit-tested (they are I/O). They will have a contract test: given a known Key Point and a date range, assert the response conforms to the Forecast schema.

Forecast horizon tests assert that normalized Forecasts contain days 1–14, days 8–14 are marked `low`, collapsed card rendering excludes days 8–14, and expanded card rendering includes all 14 days with the visible low-confidence label.

No prior test art exists in the codebase — this is a greenfield project.

## Out of Scope

- User authentication and accounts
- Push or email notifications (only in-app badge is in scope)
- Scraping-based Source adapters (interface is designed for it, but not built)
- Mobile app
- Multi-user or cross-device sync
- Forecast horizons beyond 14 days
- Avalanche bulletin integration (avalanche risk signal is derived from weather variables only, not external bulletins)
- Social or sharing features
- Offline mode / PWA

## Further Notes

- The app is strictly personal — no multi-tenancy concerns affect the schema or API design.
- The Source adapter interface should be the primary extension point. Adding a new weather API or a scraping adapter must not require changes to the Aggregation Engine.
- The via ferrata thunderstorm hard blocker is a safety feature — it must never be configurable off by the user reliability score or any other weight.
- Drizzle migrations should be committed to the repo so the database schema is reproducible from scratch.
