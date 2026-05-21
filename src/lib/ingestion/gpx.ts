import type { AreaDraft } from '$lib/domain/area';
import { buildAreaFromRoute, type RouteTrackPoint } from './route';

export interface ParsedGpxRoute {
  name?: string;
  points: RouteTrackPoint[];
}

const POINT_PATTERN = /<(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const NAME_PATTERN = /<name\b[^>]*>([\s\S]*?)<\/name>/i;
const ELEVATION_PATTERN = /<ele\b[^>]*>([\s\S]*?)<\/ele>/i;

export function ingestGpx(gpx: string, fallbackName = 'GPX route'): AreaDraft {
  const parsed = parseGpxRoute(gpx);

  return buildAreaFromRoute({
    name: parsed.name ?? fallbackName,
    points: parsed.points,
    sourceProvider: 'gpx'
  });
}

export function parseGpxRoute(gpx: string): ParsedGpxRoute {
  const points: RouteTrackPoint[] = [];

  for (const match of gpx.matchAll(POINT_PATTERN)) {
    const attributes = match[2];
    const body = match[3];
    const latitude = parseNumericAttribute(attributes, 'lat');
    const longitude = parseNumericAttribute(attributes, 'lon');
    const elevationMatch = body.match(ELEVATION_PATTERN);
    const elevationM = elevationMatch
      ? Number(decodeXmlEntities(elevationMatch[1]).trim())
      : NaN;

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Number.isFinite(elevationM)
    ) {
      points.push({ latitude, longitude, elevationM });
    }
  }

  const nameMatch = gpx.match(NAME_PATTERN);
  const name = nameMatch ? decodeXmlEntities(nameMatch[1]).trim() : undefined;

  return {
    name: name && name.length > 0 ? name : undefined,
    points
  };
}

function parseNumericAttribute(attributes: string, name: string): number {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = attributes.match(pattern);
  return match ? Number(decodeXmlEntities(match[2])) : NaN;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
