# Scout uses a seeded meta-Source row as its refresh trigger

The Scout adapter is invoked via a permanent `Source` row (`name = 'Scout'`, `adapter = 'scout'`) seeded in the database at migration time. When the refresh pipeline encounters this row, it runs the Scout instead of a conventional fetch. The meta-row itself accumulates no forecast data.

## Considered Options

**Outing-creation trigger** — run the Scout when a new Outing is created. Rejected: ties discovery to a UI event rather than the refresh cycle, leaving a newly-created outing with no forecasts until the user explicitly acts.

**Time-based re-run** — re-scout every N days automatically. Rejected: adds scheduler complexity; the set of good weather sources for an area is stable enough that on-demand re-scouting suffices.

**Explicit "Re-scout" button** — the Scout runs only when the user presses a button on the outing card. Adopted for re-runs. The initial run is bootstrapped by the seeded meta-source on first refresh.

## Consequences

The `sources` table will always contain one row that carries no forecast data and exists solely as a pipeline trigger. Future readers should not treat its absence of cached forecasts as an error. Scout-discovered sources are written as separate `Source` rows (`adapter = 'scout'`) and participate in weighting and caching exactly like any other source.
