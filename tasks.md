# Activity-Specific Outing Verdicts - Implementation Status

## Task: Add activity-specific outing verdicts

Add Activity selection to Outing creation, persist it on Outings, and apply activity-specific Verdict Engine rules.

## Acceptance Criteria - All Met ✅

### 1. Outing creation includes an Activity selector
- ✅ Activity selector in dashboard form (`src/routes/+page.svelte` lines 192-204)
- ✅ Options: hiking, snowshoeing, skiing, ski touring, via ferrata
- ✅ Defined in `ACTIVITY_OPTIONS` (`src/lib/domain/outings.ts` lines 7-13)

### 2. Activity is persisted in SQLite on the Outing
- ✅ Schema field: `activity: text('activity').notNull().default('hiking')` (`src/lib/server/db/schema.ts` line 41)
- ✅ Persisted on create: `activity: input.activity` (`src/lib/server/outings.ts` line 128)
- ✅ Retrieved for display: activity included in all outing queries

### 3. Verdict Engine applies activity-specific variable weights
- ✅ Base scoring: precipitation, wind, visibility, temperature (all activities)
- ✅ Snow activities (skiing/snowshoeing): added snow depth and freeze level scoring
- ✅ Ski touring: stricter wind thresholds (20/45 vs 25/55) + avalanche risk scoring
- ✅ Implementation: `computeDayVerdict()` (`src/lib/domain/outings.ts` lines 125-170)

### 4. Via ferrata Verdict is always Bad when thunderstorm probability exceeds threshold
- ✅ Hard blocker implemented: returns 'Bad' when thunderstormProbabilityPct > 30, regardless of other variables
- ✅ Threshold: 30% (THUNDERSTORM_HARD_BLOCKER_PCT constant)
- ✅ Implementation: `src/lib/domain/outings.ts` lines 129-134

### 5. Skiing and Snowshoeing expanded cards show snow depth and freeze level
- ✅ Snow depth: included in keyNumbers as 'Snow' label
- ✅ Freeze level: included in keyNumbers as 'Freeze' label
- ✅ Display: shown in expanded outing view via day.keyNumbers
- ✅ Implementation: `keyNumbersForDay()` (`src/lib/domain/outings.ts` lines 190-195)

### 6. Ski touring expanded cards show wind threshold breach and avalanche risk signal
- ✅ Wind: included in base metrics and scored with stricter thresholds
- ✅ Avalanche risk: included in keyNumbers as 'Avalanche' label (X/5 format)
- ✅ Implementation: `keyNumbersForDay()` (`src/lib/domain/outings.ts` lines 198-203)

### 7. Unit tests cover each activity type, via ferrata hard blocker, and boundary transitions
- ✅ Via ferrata thunderstorm blocker:
  - Below threshold (29%): returns Good
  - At threshold (30%): returns Good  
  - Above threshold (31%): returns Bad
  - Regardless of other variables: returns Bad when above threshold
- ✅ Hiking activity: base scoring, single and multiple variable thresholds
- ✅ Skiing activity: snow depth/freeze level scoring, combinations, boundaries
- ✅ Snowshoeing activity: like skiing, with separate test coverage
- ✅ Ski touring activity: avalanche risk thresholds, wind threshold differences
- ✅ Good/Uncertain/Bad boundaries: score < 2 (Good), 2-3 (Uncertain), >= 4 (Bad)
- ✅ Test additions: `src/lib/domain/outings.test.ts` (comprehensive activity-aware test suite)

## Test Results

- **Test Files**: 10 passed (10)
- **Tests**: 54 passed (54)
- **Lint**: All files use Prettier code style
- **Typecheck**: 0 ERRORS, 0 WARNINGS
- **Duration**: ~580ms

## Summary

All activity-specific outing verdict requirements have been implemented and thoroughly tested:

1. The activity selection feature was already present in the codebase
2. Database persistence of activity was already implemented
3. Verdict Engine already applies activity-specific variable weights
4. Via ferrata hard blocker for thunderstorms was already in place
5. UI correctly displays activity-specific metrics in expanded cards
6. Comprehensive unit tests added to verify all activity types, boundary conditions, and hard blocker behavior

The implementation is complete, all tests pass, and all code quality checks pass.
