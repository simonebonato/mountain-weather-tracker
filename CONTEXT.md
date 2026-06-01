# Domain Language

## Area

A named location the user wants to track weather for. Can be created from multiple input formats (GPX file, city name + context, hiking app link). Regardless of input, an Area is canonically stored as a small set of **Key Points** (1–5).

## Key Point

A geographic anchor within an Area: a latitude/longitude coordinate plus an elevation in meters. Derived automatically from the input format:

- GPX track → start, highest point, end (up to 5 points)
- City name → one point, elevation estimated from terrain data
- Hiking app link → resolved to GPX-equivalent, then same treatment as GPX

Weather is fetched independently for each Key Point within an Area.

## Weather Summary

The aggregated output for an Area on a given date. Composed of two layers:

- **Verdict** — a fast-scan signal (Good / Uncertain / Bad) derived from weighted aggregation of all Sources
- **Confidence Range** — the spread of forecasts across Sources for each weather variable; a wide spread signals high uncertainty

## Forecast

A single weather prediction for a Key Point from one Source, covering one or more days. Cached in the database with a 6-hour TTL. The UI shows a "last updated at HH:MM" label and refreshes stale data in the background.

Forecasts have a maximum supported planning horizon of 14 days. Days 1–7 are the normal-confidence horizon. Days 8–14 are the extended horizon and must be marked `low confidence`; this is a horizon-quality label, separate from Confidence Range source-spread.

## Comparison View

The main interface: a ranked list of Outings sorted best-to-worst by Verdict score for a selected date range. Each Outing is shown as a compact card (Verdict + 2–3 key numbers). Collapsed cards show only the normal-confidence 7-day horizon. Expanding a card reveals the full Confidence Range and per-day breakdown, including days 8–14 visually dimmed and labelled "low confidence".

## Activity

The type of mountain activity planned. Belongs to an Outing, not an Area. Determines which weather variables are surfaced and how the Verdict is computed:

- All activities share a base set: precipitation, wind speed, temperature, visibility
- **Via ferrata** — thunderstorm probability is a hard blocker (Verdict = Bad regardless of other variables)
- **Skiing / Snowshoeing** — adds snow depth, freeze level
- **Ski touring** — adds wind above threshold, avalanche risk signal
- **Hiking** — base set only

## Outing

A planned trip combining one Area + one Activity + a date range (one or more consecutive days). The unit against which a Weather Summary is computed. An Area can be reused across multiple Outings with different Activities.

A multi-day Outing shows:

- A per-day Verdict + Confidence Range for each day in the range
- A trip-level Verdict derived from the worst day in the range

## Source

A weather data provider. Each Source carries a composite weight used when computing a Weather Summary:

1. **Geographic match score** — how well the Source covers the country/region of the Area (higher for national services like MeteoSvizzera, ZAMG, Météo-France)
2. **Domain specialty score** — whether the Source specializes in mountain or snow/ski conditions (higher for mountain-specific services)
3. **User reliability score** (optional) — a manual 1–5 trust override the user can set per Source; multiplied in when provided

Final weight = geographic match × domain specialty × (reliability if set, else 1).

Sources that lack a structured API carry **fetch instructions** — free-text guidance (URL + navigation notes) used by the agent adapter to locate and extract forecast data. Sources without fetch instructions use a hardcoded API adapter (e.g. Open-Meteo).

## Discovery

The user-triggered process of finding new Sources through web exploration. Initiated from the settings UI when coverage for a region feels lacking. The agent explores the web, proposes new Source records with initial geographic match and domain specialty scores, and persists them for user review. Discovered Sources participate in forecast aggregation immediately; the user can adjust scores or set a reliability score afterward.

## Scout

An autonomous find-and-fetch agent adapter (`adapter = 'scout'`). Unlike the scripted agent adapter (which follows explicit `fetch_instructions` for a known Source), the Scout is given a location, an activity, optional Scouting Notes, and a set of dates, and autonomously decides which weather websites to consult. It upserts one `Source` row per discovered site and populates their forecast cache entries directly. A permanent meta-`Source` row (`name = 'Scout'`, `adapter = 'scout'`) acts as the trigger in the refresh pipeline. The Scout re-runs only when the user explicitly presses "Re-scout" on the outing card.

## Scouting Notes

Optional free-text on an Outing that the user can supply to bias the Scout's source selection. Examples: "focus on summit wind and avalanche bulletin", "family trip — prioritise rain and temperature". Stored as `scouting_notes` on the `outings` table. Passed verbatim into the Scout's prompt alongside the activity.
