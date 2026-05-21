import type { AreaDraft, KeyPoint } from '$lib/domain/area';

export interface RouteTrackPoint {
  latitude: number;
  longitude: number;
  elevationM: number;
}

export interface RouteKeyPointOptions {
  maxKeyPoints?: number;
  flatElevationThresholdM?: number;
  peakProminenceThresholdM?: number;
}

const DEFAULT_MAX_KEY_POINTS = 5;
const DEFAULT_FLAT_ELEVATION_THRESHOLD_M = 5;
const DEFAULT_PEAK_PROMINENCE_THRESHOLD_M = 8;

export function buildAreaFromRoute(input: {
  name: string;
  points: readonly RouteTrackPoint[];
  sourceUrl?: string;
  sourceProvider?: string;
  keyPointOptions?: RouteKeyPointOptions;
}): AreaDraft {
  const keyPoints = extractRouteKeyPoints(input.points, input.keyPointOptions);

  return {
    name: normalizeAreaName(input.name),
    keyPoints,
    sourceUrl: input.sourceUrl,
    sourceProvider: input.sourceProvider
  };
}

export function extractRouteKeyPoints(
  points: readonly RouteTrackPoint[],
  options: RouteKeyPointOptions = {}
): KeyPoint[] {
  const cleaned = points.filter(isValidTrackPoint);

  if (cleaned.length === 0) {
    throw new Error('Route metadata did not include any valid coordinates.');
  }

  const maxKeyPoints = Math.max(
    1,
    Math.floor(options.maxKeyPoints ?? DEFAULT_MAX_KEY_POINTS)
  );
  const flatElevationThresholdM =
    options.flatElevationThresholdM ?? DEFAULT_FLAT_ELEVATION_THRESHOLD_M;
  const peakProminenceThresholdM =
    options.peakProminenceThresholdM ?? DEFAULT_PEAK_PROMINENCE_THRESHOLD_M;

  const elevations = cleaned.map((point) => point.elevationM);
  const minElevationM = Math.min(...elevations);
  const maxElevationM = Math.max(...elevations);

  if (
    maxKeyPoints === 1 ||
    maxElevationM - minElevationM <= flatElevationThresholdM
  ) {
    const representativeIndex = indexOfHighestPoint(cleaned);
    return [toKeyPoint(cleaned[representativeIndex], 'Route')];
  }

  const selectedIndices = new Set<number>([0, cleaned.length - 1]);
  const interiorSlots = Math.max(0, maxKeyPoints - selectedIndices.size);
  const peakIndices = findPeakIndices(cleaned, peakProminenceThresholdM);

  if (peakIndices.length === 0) {
    const highestIndex = indexOfHighestPoint(cleaned);
    if (highestIndex !== 0 && highestIndex !== cleaned.length - 1) {
      peakIndices.push(highestIndex);
    }
  }

  peakIndices
    .sort((left, right) => cleaned[right].elevationM - cleaned[left].elevationM)
    .slice(0, interiorSlots)
    .forEach((index) => selectedIndices.add(index));

  const orderedIndices = [...selectedIndices].sort(
    (left, right) => left - right
  );
  let highPointCount = 0;

  return orderedIndices.map((index, orderedIndex) => {
    if (orderedIndex === 0 && index === 0) {
      return toKeyPoint(cleaned[index], 'Start');
    }

    if (
      orderedIndex === orderedIndices.length - 1 &&
      index === cleaned.length - 1
    ) {
      return toKeyPoint(cleaned[index], 'End');
    }

    highPointCount += 1;
    const label =
      highPointCount === 1 ? 'High point' : `High point ${highPointCount}`;
    return toKeyPoint(cleaned[index], label);
  });
}

function findPeakIndices(
  points: readonly RouteTrackPoint[],
  prominenceThresholdM: number
): number[] {
  const peaks: number[] = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1].elevationM;
    const current = points[index].elevationM;
    const next = points[index + 1].elevationM;
    const lowerNeighbor = Math.min(previous, next);

    if (
      current >= previous &&
      current >= next &&
      current - lowerNeighbor >= prominenceThresholdM
    ) {
      peaks.push(index);
    }
  }

  return peaks;
}

function indexOfHighestPoint(points: readonly RouteTrackPoint[]): number {
  return points.reduce(
    (highestIndex, point, index) =>
      point.elevationM > points[highestIndex].elevationM ? index : highestIndex,
    0
  );
}

function toKeyPoint(point: RouteTrackPoint, label: string): KeyPoint {
  return {
    label,
    latitude: roundCoordinate(point.latitude),
    longitude: roundCoordinate(point.longitude),
    elevationM: Math.round(point.elevationM)
  };
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function isValidTrackPoint(point: RouteTrackPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Number.isFinite(point.elevationM) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function normalizeAreaName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : 'Imported route';
}
