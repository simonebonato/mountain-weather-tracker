# PRD: Agent-based weather fetching

## Problem Statement

The app's multi-source averaging model — which drives the Verdict and Confidence Range shown for every Outing — requires data from several regional and national weather services. Most of the high-value sources (MeteoSvizzera, ZAMG, Météo-France) do not expose structured APIs. Currently, only Open-Meteo is integrated, so the Confidence Range is computed from a single source, which defeats its purpose and limits Verdict accuracy for mountain conditions.

## Solution

Introduce an agent-based Source adapter that fetches forecasts from websites using an AI agent (Codex, with Claude as an optional fallback if credentials are available). Each Source can carry `fetch_instructions` — a URL plus free-text navigation notes — that the agent uses to locate and extract forecast data. The agent returns a `ForecastPayload[]` in the same format as the existing Open-Meteo adapter, so it plugs directly into the refresh pipeline. A separate Discovery flow lets users prompt the agent to find and propose new Sources for a given Area, which are then persisted and editable from the settings page.

## User Stories

1. As a user, I want forecasts to be pulled from regional weather services (e.g. MeteoSvizzera, ZAMG) so that the Verdict for my planned Outing reflects sources that specialise in my region.
2. As a user, I want the Confidence Range to reflect genuine disagreement between multiple independent sources so that I can judge forecast uncertainty for a mountain trip.
3. As a user, I want agent-fetched forecasts to be cached with the same 6-hour TTL as other forecasts so that the app doesn't make expensive agent calls on every page load.
4. As a user, I want to trigger a "Discover sources" action from the settings page so that the agent proposes new weather sources relevant to an Area I already track.
5. As a user, I want discovered sources to appear immediately in the source list with agent-proposed geographic match and domain specialty scores so that I don't have to set them up from scratch.
6. As a user, I want to edit the reliability score on a discovered source so that I can tune how much it influences the Verdict once I've observed its quality.
7. As a user, I want to edit the `fetch_instructions` on any agent source so that I can correct the URL or navigation notes if the agent got them wrong.
8. As a user, I want to see which agent (Codex or Claude) is available on my machine so that I know whether agent-based fetching will work.
9. As a user, I want to choose between Codex and Claude in the settings page when both are available so that I can switch if one is performing better.
10. As a user, I want a clear error shown in the settings page if no agent credentials are detected so that I know I need to log in before agent fetching will work.
11. As a user, I want the agent to retry once with a correction prompt if its first output fails validation so that transient formatting errors don't cause a full fetch failure.
12. As a user, I want failed agent fetches to be skipped silently (same as today's behaviour for unsupported adapters) rather than crashing the refresh pipeline so that Open-Meteo data still loads.
13. As a user, I want agent-fetched data to include the source name in the payload so that the Confidence Range UI can label which source contributed which forecast.
14. As a user, I want discovered sources to include the agent's rationale for the proposed geographic match and domain specialty scores so that I can decide whether to accept or adjust them.
15. As a user, I want the settings page to indicate that a source was discovered automatically (rather than added manually) so that I know which ones have not been human-verified.

## Implementation Decisions

### Schema change
A nullable `fetch_instructions` text column is added to the `sources` table. Sources using the `open-meteo` adapter leave it null. Sources using the new `agent` adapter store a URL and free-text navigation notes here. This field is user-editable from the settings page.

### Adapter contract
The agent adapter has the same function signature as `fetchOpenMeteoForecasts`: it takes a Key Point and a list of dates, and returns `ForecastPayload[]`. This means `refresh.ts` only needs a new `'agent'` branch — the rest of the refresh pipeline is unchanged.

### Output enforcement
The agent is given a strict system prompt that includes: the Key Point coordinates and elevation, the date range, the Source's `fetch_instructions`, and a JSON schema for the expected output. The raw stdout is parsed and validated against a Zod schema. If validation fails, a single retry is issued with the validation error appended to the prompt. If the retry also fails, the fetch for that `(source, key point, date range)` is skipped.

### Credential detection
At startup (and when the settings page loads), the app checks for Codex credentials (`~/.codex/` config) and Claude credentials (`~/.claude/`). The result determines which agent options are shown in the settings UI. If only one agent has credentials, it is used automatically. If neither has credentials, agent-based sources are skipped during refresh and the settings page shows a setup prompt.

### Agent selection
Stored as a single application-level setting (e.g. in a `settings` table or config file). Default: Codex if available, Claude otherwise. The user can override from the settings page when both are available.

### Discovery flow
Discovery is user-triggered from the settings page. The user selects an Area; the agent receives the Area name, Key Point coordinates, and a prompt to find authoritative weather sources for that region and activity types. The agent returns an array of proposed Source records, each with a name, a URL, `fetch_instructions`, and proposed `geographicMatchScore` and `domainSpecialtyScore` values with a brief rationale. These are persisted immediately with `adapter = 'agent'`. The user can then edit scores or `fetch_instructions` from the existing source card UI.

### Subprocess invocation
The agent is invoked via `codex exec` (or `claude -p`) as a child process. The system prompt is passed via stdin. The process output is captured from stdout. A timeout is enforced to prevent hung agent calls from blocking the refresh pipeline.

### No changes to the Source weight model
The existing `geographicMatchScore × domainSpecialtyScore × reliabilityScore` formula is unchanged. Agent-based Sources participate in Verdict and Confidence Range computation identically to Open-Meteo.

## Testing Decisions

A good test exercises the module's external contract — given these inputs, expect this output — without caring how the result was produced. Tests should not assert on internal implementation details (e.g. which prompt template was used), only on observable outputs (parsed payloads, persisted records, validation errors).

### Modules with tests

| Module | What to test |
|--------|-------------|
| **Agent output parser** | Valid JSON produces correct `ForecastPayload[]`; missing fields fail validation; extra fields are ignored; retry behaviour surfaces a structured error on second failure. |
| **Agent credential detector** | Returns `{ codex: true, claude: false }` when only `~/.codex/` exists; returns both true when both dirs exist; returns both false when neither exists. |
| **Agent weather adapter** | Given a mocked subprocess runner that returns valid JSON, the adapter returns the correct `ForecastPayload[]`; given a runner that returns invalid JSON on the first call and valid JSON on the second, the adapter retries and succeeds; given two failures, the adapter throws. |
| **Source discovery runner** | Given a mocked runner that returns valid Source proposals, the runner persists the correct Source records to the DB; agent-proposed scores are stored correctly; duplicate source names are not inserted twice. |
| **Refresh pipeline** | An `'agent'` source calls the agent adapter; an `'open-meteo'` source still calls `fetchOpenMeteoForecasts`; a source with an unknown adapter is skipped without error. |
| **Agent subprocess runner (Codex only)** | A well-formed prompt produces a non-empty stdout; the runner enforces a timeout and rejects if the process hangs. |

### Prior art
- `src/lib/server/forecast/cache.test.ts` — in-memory SQLite setup pattern for DB tests
- `src/lib/forecast/sources.test.ts` — mocking fetch functions via injected `ForecastSource` objects

## Out of Scope

- Streaming agent output (the adapter waits for the full response before parsing)
- Per-source agent selection (one agent for all agent-based sources)
- Automatic discovery (Discovery is always user-triggered)
- Scheduling or rate-limiting agent fetch calls beyond the existing 6-hour TTL cache
- UI for editing the system prompt template

## Further Notes

The `codex exec` subprocess approach means the agent runs with whatever permissions and network access Codex normally has. No additional sandboxing is added at the app level. Agent calls during forecast refresh are subject to the same background-error-handling as today: failures are logged but do not surface to the UI.
