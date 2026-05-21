import {
  MAX_FORECAST_DAYS,
  confidenceTierForDay,
  type ConfidenceTier
} from '$lib/forecast/horizon';

export const ACTIVITY_OPTIONS = [
  { value: 'hiking', label: 'Hiking' },
  { value: 'snowshoeing', label: 'Snowshoeing' },
  { value: 'skiing', label: 'Skiing' },
  { value: 'ski_touring', label: 'Ski touring' },
  { value: 'via_ferrata', label: 'Via ferrata' }
] as const;

export type Activity = (typeof ACTIVITY_OPTIONS)[number]['value'];
export type Verdict = 'Good' | 'Uncertain' | 'Bad';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ForecastMetrics {
  temperatureC: number;
  precipitationMm: number;
  windKmh: number;
  visibilityKm: number;
  thunderstormProbabilityPct: number;
  snowDepthCm: number;
  freezeLevelM: number;
  avalancheRisk: number;
}

export interface KeyNumber {
  label: string;
  value: string;
}

export interface DailyVerdict {
  dayIndex: number;
  date: string;
  verdict: Verdict;
  confidenceTier: ConfidenceTier;
  metrics: ForecastMetrics;
  keyNumbers: KeyNumber[];
}

export interface TripSummary {
  tripVerdict: Verdict;
  worstDay: DailyVerdict;
  days: DailyVerdict[];
  compactNumbers: KeyNumber[];
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VERDICT_SEVERITY: Record<Verdict, number> = {
  Good: 0,
  Uncertain: 1,
  Bad: 2
};

const THUNDERSTORM_HARD_BLOCKER_PCT = 30;

export function isActivity(value: string): value is Activity {
  return ACTIVITY_OPTIONS.some((activity) => activity.value === value);
}

export function activityLabel(activity: Activity): string {
  return (
    ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label ??
    activity
  );
}

export function assertDateRange(range: DateRange): void {
  if (
    !DATE_ONLY_PATTERN.test(range.startDate) ||
    !DATE_ONLY_PATTERN.test(range.endDate)
  ) {
    throw new Error('Start and end dates are required.');
  }

  if (toUtcTime(range.endDate) < toUtcTime(range.startDate)) {
    throw new Error('End date must be on or after the start date.');
  }
}

export function enumerateDateRange(range: DateRange): string[] {
  assertDateRange(range);

  const dates: string[] = [];
  const current = new Date(`${range.startDate}T00:00:00.000Z`);
  const endTime = toUtcTime(range.endDate);

  while (current.getTime() <= endTime) {
    dates.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function enumerateForecastHorizon(startDate: string): string[] {
  assertDateRange({ startDate, endDate: startDate });

  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);

  for (let index = 0; index < MAX_FORECAST_DAYS; index += 1) {
    dates.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function forecastHorizonEndDate(startDate: string): string {
  return enumerateForecastHorizon(startDate)[MAX_FORECAST_DAYS - 1];
}

export function todayDateString(now = new Date()): string {
  return formatDateOnly(now);
}

export function computeDayVerdict(
  metrics: ForecastMetrics,
  activity: Activity
): Verdict {
  if (
    activity === 'via_ferrata' &&
    metrics.thunderstormProbabilityPct > THUNDERSTORM_HARD_BLOCKER_PCT
  ) {
    return 'Bad';
  }

  let score = 0;

  score += variableScore(metrics.precipitationMm, { goodMax: 2, badMin: 12 });
  score += variableScore(metrics.windKmh, { goodMax: 25, badMin: 55 });
  score += lowValueScore(metrics.visibilityKm, {
    badBelow: 2,
    uncertainBelow: 8
  });
  score += temperatureScore(metrics.temperatureC);

  if (
    activity === 'skiing' ||
    activity === 'snowshoeing' ||
    activity === 'ski_touring'
  ) {
    score += lowValueScore(metrics.snowDepthCm, {
      badBelow: 10,
      uncertainBelow: 25
    });
    score += freezeLevelScore(metrics.freezeLevelM);
  }

  if (activity === 'ski_touring') {
    if (metrics.avalancheRisk >= 4) {
      return 'Bad';
    }

    score += variableScore(metrics.windKmh, { goodMax: 20, badMin: 45 });
    score += variableScore(metrics.avalancheRisk, { goodMax: 1, badMin: 4 });
  }

  if (score >= 4) return 'Bad';
  if (score >= 2) return 'Uncertain';
  return 'Good';
}

export function keyNumbersForDay(
  activity: Activity,
  metrics: ForecastMetrics
): KeyNumber[] {
  const base: KeyNumber[] = [
    { label: 'Temp', value: `${Math.round(metrics.temperatureC)}°C` },
    { label: 'Precip', value: `${roundOne(metrics.precipitationMm)} mm` },
    { label: 'Wind', value: `${Math.round(metrics.windKmh)} km/h` },
    { label: 'Vis', value: `${roundOne(metrics.visibilityKm)} km` }
  ];

  if (activity === 'via_ferrata') {
    return [
      ...base,
      { label: 'Storms', value: `${metrics.thunderstormProbabilityPct}%` }
    ];
  }

  if (activity === 'skiing' || activity === 'snowshoeing') {
    return [
      ...base,
      { label: 'Snow', value: `${metrics.snowDepthCm} cm` },
      { label: 'Freeze', value: `${metrics.freezeLevelM} m` }
    ];
  }

  if (activity === 'ski_touring') {
    return [
      ...base,
      { label: 'Snow', value: `${metrics.snowDepthCm} cm` },
      { label: 'Avalanche', value: `${metrics.avalancheRisk}/5` }
    ];
  }

  return base;
}

export function worstVerdict(days: Pick<DailyVerdict, 'verdict'>[]): Verdict {
  if (days.length === 0) {
    throw new Error('At least one day is required to compute a trip verdict.');
  }

  return days.reduce<Verdict>((worst, day) => {
    return VERDICT_SEVERITY[day.verdict] > VERDICT_SEVERITY[worst]
      ? day.verdict
      : worst;
  }, 'Good');
}

export function buildTripSummary(
  dailyForecasts: { date: string; metrics: ForecastMetrics }[],
  activity: Activity
): TripSummary {
  const days = dailyForecasts
    .slice(0, MAX_FORECAST_DAYS)
    .map<DailyVerdict>((forecast, index) => {
      const dayIndex = index + 1;

      return {
        dayIndex,
        date: forecast.date,
        verdict: computeDayVerdict(forecast.metrics, activity),
        confidenceTier: confidenceTierForDay(dayIndex),
        metrics: forecast.metrics,
        keyNumbers: keyNumbersForDay(activity, forecast.metrics)
      };
    });

  const tripVerdict = worstVerdict(days);
  const worstDay =
    days.find((day) => day.verdict === tripVerdict) ??
    (() => {
      throw new Error(
        'At least one day is required to compute a trip summary.'
      );
    })();

  return {
    tripVerdict,
    worstDay,
    days,
    compactNumbers: worstDay.keyNumbers.slice(0, 3)
  };
}

export function formatDateRange(range: DateRange): string {
  if (range.startDate === range.endDate)
    return formatDisplayDate(range.startDate);
  return `${formatDisplayDate(range.startDate)} - ${formatDisplayDate(range.endDate)}`;
}

export function formatDisplayDate(date: string): string {
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });

  return formatter.format(new Date(`${date}T00:00:00.000Z`));
}

export function deterministicForecastForDate(
  date: string,
  seedText: string
): ForecastMetrics {
  const seed = numericSeed(`${seedText}:${date}`);

  return {
    temperatureC: Math.round((6 + (seed % 210) / 10) * 10) / 10,
    precipitationMm: Math.round(((seed >>> 3) % 180) / 10),
    windKmh: 8 + ((seed >>> 6) % 58),
    visibilityKm: Math.round((1.5 + ((seed >>> 8) % 130) / 10) * 10) / 10,
    thunderstormProbabilityPct: (seed >>> 10) % 65,
    snowDepthCm: (seed >>> 12) % 95,
    freezeLevelM: 900 + ((seed >>> 14) % 2600),
    avalancheRisk: 1 + ((seed >>> 16) % 5)
  };
}

function variableScore(
  value: number,
  thresholds: { goodMax: number; badMin: number }
): number {
  if (value >= thresholds.badMin) return 2;
  if (value > thresholds.goodMax) return 1;
  return 0;
}

function lowValueScore(
  value: number,
  thresholds: { badBelow: number; uncertainBelow: number }
): number {
  if (value < thresholds.badBelow) return 2;
  if (value < thresholds.uncertainBelow) return 1;
  return 0;
}

function temperatureScore(value: number): number {
  if (value < -25 || value > 35) return 2;
  if (value < -15 || value > 30) return 1;
  return 0;
}

function freezeLevelScore(value: number): number {
  if (value < 800 || value > 3200) return 2;
  if (value < 1200 || value > 2600) return 1;
  return 0;
}

function roundOne(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function numericSeed(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function toUtcTime(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
