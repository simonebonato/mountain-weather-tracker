import type { AreaDraft } from '$lib/domain/area';
import { buildAreaFromRoute, type RouteTrackPoint } from './route';

export type HikingUrlProvider = 'komoot' | 'opentrails';

export type HikingUrlErrorCode =
  | 'unsupported-url'
  | 'fetch-failed'
  | 'inaccessible-route'
  | 'missing-route-geometry';

export class HikingUrlIngestionError extends Error {
  readonly code: HikingUrlErrorCode;
  readonly provider?: HikingUrlProvider;
  readonly status?: number;

  constructor(
    code: HikingUrlErrorCode,
    message: string,
    options: {
      provider?: HikingUrlProvider;
      status?: number;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'HikingUrlIngestionError';
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
  }
}

export interface HikingUrlIngestionOptions {
  fetch?: FetchLike;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const HTML_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const JSON_ACCEPT = 'application/json,*/*;q=0.8';
const USER_AGENT =
  'mountain-weather-tracker/0.1 (+https://github.com/simonebonato/mountain-weather-tracker)';

export async function ingestHikingAppUrl(
  inputUrl: string,
  options: HikingUrlIngestionOptions = {}
): Promise<AreaDraft> {
  const url = parseUrl(inputUrl);
  const provider = providerForUrl(url);
  const fetcher = options.fetch ?? globalThis.fetch;

  if (!fetcher) {
    throw new HikingUrlIngestionError(
      'fetch-failed',
      'This runtime does not provide fetch().'
    );
  }

  if (!provider) {
    throw new HikingUrlIngestionError(
      'unsupported-url',
      'Paste a public Komoot or O-Trails route URL.'
    );
  }

  if (provider === 'komoot') {
    return ingestKomootUrl(url, fetcher);
  }

  return ingestOpenTrailsUrl(url, fetcher);
}

export function isSupportedHikingAppUrl(inputUrl: string): boolean {
  try {
    return providerForUrl(new URL(inputUrl)) !== undefined;
  } catch {
    return false;
  }
}

export function formatHikingUrlError(error: unknown): string {
  if (!(error instanceof HikingUrlIngestionError)) {
    return 'The route could not be imported. Check the URL and try again.';
  }

  return error.message;
}

async function ingestKomootUrl(
  url: URL,
  fetcher: FetchLike
): Promise<AreaDraft> {
  const pageHtml = await fetchText(url, fetcher, 'komoot', HTML_ACCEPT);
  const routeName = extractMetaTitle(pageHtml) ?? 'Komoot route';
  const coordinatesUrl = extractKomootCoordinatesUrl(pageHtml, url);

  if (!coordinatesUrl) {
    throw new HikingUrlIngestionError(
      'missing-route-geometry',
      'This Komoot URL did not expose route coordinates. Make sure the route is public.',
      { provider: 'komoot' }
    );
  }

  const coordinatesJson = await fetchJson(coordinatesUrl, fetcher, 'komoot');
  const points = parseKomootRoutePoints(coordinatesJson);

  if (points.length === 0) {
    throw new HikingUrlIngestionError(
      'missing-route-geometry',
      'Komoot returned route metadata without usable coordinates and elevations.',
      { provider: 'komoot' }
    );
  }

  return buildAreaFromRoute({
    name: routeName,
    points,
    sourceUrl: url.toString(),
    sourceProvider: 'komoot'
  });
}

async function ingestOpenTrailsUrl(
  url: URL,
  fetcher: FetchLike
): Promise<AreaDraft> {
  const pageHtml = await fetchText(url, fetcher, 'opentrails', HTML_ACCEPT);
  const candidates = extractEmbeddedJson(pageHtml);
  const points = firstRoutePoints(candidates);
  const routeName =
    firstRouteName(candidates) ??
    extractMetaTitle(pageHtml) ??
    'O-Trails route';

  if (points.length === 0) {
    throw new HikingUrlIngestionError(
      'missing-route-geometry',
      'This O-Trails URL is public, but it does not expose route geometry with elevations. Import a GPX export or use a public route page that includes coordinates.',
      { provider: 'opentrails' }
    );
  }

  return buildAreaFromRoute({
    name: routeName,
    points,
    sourceUrl: url.toString(),
    sourceProvider: 'opentrails'
  });
}

async function fetchText(
  url: URL,
  fetcher: FetchLike,
  provider: HikingUrlProvider,
  accept: string
): Promise<string> {
  let response: Response;

  try {
    response = await fetcher(url, { headers: requestHeaders(accept) });
  } catch (error) {
    throw new HikingUrlIngestionError(
      'fetch-failed',
      'The route URL could not be reached.',
      {
        provider,
        cause: error
      }
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new HikingUrlIngestionError(
      'inaccessible-route',
      'This route is private or requires login. Paste a public route URL.',
      { provider, status: response.status }
    );
  }

  if (!response.ok) {
    throw new HikingUrlIngestionError(
      'fetch-failed',
      `The route URL returned HTTP ${response.status}.`,
      { provider, status: response.status }
    );
  }

  return response.text();
}

async function fetchJson(
  url: URL,
  fetcher: FetchLike,
  provider: HikingUrlProvider
): Promise<unknown> {
  const text = await fetchText(url, fetcher, provider, JSON_ACCEPT);

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new HikingUrlIngestionError(
      'fetch-failed',
      'The route metadata response was not valid JSON.',
      { provider, cause: error }
    );
  }
}

function requestHeaders(accept: string): HeadersInit {
  return {
    accept,
    'user-agent': USER_AGENT
  };
}

function parseUrl(inputUrl: string): URL {
  try {
    return new URL(inputUrl);
  } catch (error) {
    throw new HikingUrlIngestionError(
      'unsupported-url',
      'Paste a valid route URL.',
      {
        cause: error
      }
    );
  }
}

function providerForUrl(url: URL): HikingUrlProvider | undefined {
  const hostname = url.hostname.toLowerCase();

  if (hostname === 'komoot.com' || hostname.endsWith('.komoot.com')) {
    return 'komoot';
  }

  if (
    hostname === 'opentrails.co.nz' ||
    hostname.endsWith('.opentrails.co.nz') ||
    hostname === 'app.opentrails.net' ||
    hostname.endsWith('.app.opentrails.net') ||
    hostname.includes('o-trails') ||
    hostname.includes('otrails')
  ) {
    return 'opentrails';
  }

  return undefined;
}

function extractKomootCoordinatesUrl(
  html: string,
  pageUrl: URL
): URL | undefined {
  const normalizedHtml = normalizeEscapedHtml(html);
  const hrefMatch = normalizedHtml.match(
    /https:\/\/api\.komoot\.de\/v\d+\/tours\/(\d+)\/coordinates\b/
  );

  if (hrefMatch?.[0]) {
    return new URL(hrefMatch[0]);
  }

  const routeId = extractKomootRouteId(pageUrl);
  return routeId
    ? new URL(`https://api.komoot.de/v007/tours/${routeId}/coordinates`)
    : undefined;
}

function extractKomootRouteId(url: URL): string | undefined {
  const path = url.pathname;
  const routePatterns = [
    /\/tour\/(\d+)(?:\/|$)/,
    /\/tours\/(\d+)(?:\/|$)/,
    /\/smarttour\/e?(\d+)(?:\/|$)/,
    /\/discover_tours\/e?(\d+)(?:\/|$)/
  ];

  for (const pattern of routePatterns) {
    const match = path.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function parseKomootRoutePoints(value: unknown): RouteTrackPoint[] {
  if (isObject(value)) {
    if (Array.isArray(value.items)) {
      return parseObjectCoordinateArray(value.items);
    }

    if (Array.isArray(value.geometry)) {
      return parseObjectCoordinateArray(value.geometry);
    }
  }

  return firstRoutePoints([value]);
}

function extractEmbeddedJson(html: string): unknown[] {
  const candidates: unknown[] = [];
  const dataPageMatch = html.match(/\bdata-page="([^"]+)"/i);

  if (dataPageMatch?.[1]) {
    pushJsonCandidate(candidates, decodeHtmlAttribute(dataPageMatch[1]));
  }

  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = normalizeEscapedHtml(decodeHtmlEntities(match[1]).trim());

    if (script.startsWith('{') || script.startsWith('[')) {
      pushJsonCandidate(candidates, script);
    }
  }

  return candidates;
}

function pushJsonCandidate(candidates: unknown[], jsonText: string): void {
  try {
    candidates.push(JSON.parse(jsonText) as unknown);
  } catch {
    // Ignore unrelated scripts. The adapter only needs parseable route payloads.
  }
}

function firstRoutePoints(candidates: readonly unknown[]): RouteTrackPoint[] {
  for (const candidate of candidates) {
    const points = findRoutePoints(candidate);

    if (points.length > 0) {
      return points;
    }
  }

  return [];
}

function firstRouteName(candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    const name = findRouteName(candidate);

    if (name) {
      return name;
    }
  }

  return undefined;
}

function findRoutePoints(
  value: unknown,
  seen = new Set<unknown>(),
  depth = 0
): RouteTrackPoint[] {
  if (depth > 8 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return [];
    }

    seen.add(value);
  }

  const tuplePoints = parseCoordinateTupleArray(value);
  if (tuplePoints.length > 0) {
    return tuplePoints;
  }

  const objectPoints = parseObjectCoordinateArray(value);
  if (objectPoints.length > 0) {
    return objectPoints;
  }

  if (isObject(value)) {
    if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
      const lineStringPoints = parseCoordinateTupleArray(value.coordinates);
      if (lineStringPoints.length > 0) {
        return lineStringPoints;
      }
    }

    const preferredKeys = [
      'route',
      'trail',
      'track',
      'geometry',
      'coordinates',
      'points',
      'routePoints',
      'trackPoints',
      'items',
      'features',
      'props',
      'pageProps'
    ];

    for (const key of preferredKeys) {
      if (key in value) {
        const nested = findRoutePoints(value[key], seen, depth + 1);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    for (const nestedValue of Object.values(value)) {
      const nested = findRoutePoints(nestedValue, seen, depth + 1);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findRoutePoints(item, seen, depth + 1);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function findRouteName(
  value: unknown,
  seen = new Set<unknown>(),
  depth = 0
): string | undefined {
  if (depth > 8 || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return undefined;
    }

    seen.add(value);
  }

  if (isObject(value)) {
    const directName = stringValue(value.name) ?? stringValue(value.title);

    if (directName) {
      return directName;
    }

    for (const nestedValue of Object.values(value)) {
      const nestedName = findRouteName(nestedValue, seen, depth + 1);

      if (nestedName) {
        return nestedName;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedName = findRouteName(item, seen, depth + 1);

      if (nestedName) {
        return nestedName;
      }
    }
  }

  return undefined;
}

function parseObjectCoordinateArray(value: unknown): RouteTrackPoint[] {
  if (!Array.isArray(value) || value.length < 1) {
    return [];
  }

  const points = value
    .map(parseObjectCoordinate)
    .filter((point): point is RouteTrackPoint => point !== undefined);
  return points.length === value.length ? points : [];
}

function parseObjectCoordinate(value: unknown): RouteTrackPoint | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const latitude = numberValue(value.lat) ?? numberValue(value.latitude);
  const longitude =
    numberValue(value.lng) ??
    numberValue(value.lon) ??
    numberValue(value.longitude);
  const elevationM =
    numberValue(value.alt) ??
    numberValue(value.ele) ??
    numberValue(value.elevation) ??
    numberValue(value.elevationM) ??
    numberValue(value.elevation_m) ??
    numberValue(value.altitude) ??
    numberValue(value.altitudeM);

  if (
    latitude === undefined ||
    longitude === undefined ||
    elevationM === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(elevationM)
  ) {
    return undefined;
  }

  return { latitude, longitude, elevationM };
}

function parseCoordinateTupleArray(value: unknown): RouteTrackPoint[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    !value.every(Array.isArray)
  ) {
    return [];
  }

  const points = value
    .map((item) => {
      const tuple = item as unknown[];

      if (tuple.length < 3) {
        return undefined;
      }

      const longitude = numberValue(tuple[0]);
      const latitude = numberValue(tuple[1]);
      const elevationM = numberValue(tuple[2]);

      if (
        latitude === undefined ||
        longitude === undefined ||
        elevationM === undefined
      ) {
        return undefined;
      }

      return { latitude, longitude, elevationM };
    })
    .filter((point): point is RouteTrackPoint => point !== undefined);

  return points.length === value.length ? points : [];
}

function extractMetaTitle(html: string): string | undefined {
  const title =
    extractMetaContent(html, 'property', 'og:title') ??
    extractMetaContent(html, 'name', 'twitter:title') ??
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  if (!title) {
    return undefined;
  }

  const decodedTitle = decodeHtmlEntities(title).replace(/\s+/g, ' ').trim();
  const withoutProvider = decodedTitle
    .replace(/\s+\|\s+(hike|run|bike|mtb|tour)\s+\|\s+Komoot$/i, '')
    .replace(/\s+\|\s+Komoot$/i, '')
    .replace(/\s+-\s+OpenTrails$/i, '')
    .trim();

  return withoutProvider.length > 0 ? withoutProvider : undefined;
}

function extractMetaContent(
  html: string,
  attributeName: string,
  attributeValue: string
): string | undefined {
  const metaPattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attributeName}=["']${escapeRegex(attributeValue)}["'])(?=[^>]*\\bcontent=["']([^"']+)["'])[^>]*>`,
    'i'
  );
  return html.match(metaPattern)?.[1];
}

function normalizeEscapedHtml(value: string): string {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\u002F/g, '/')
    .replace(/&amp;/g, '&');
}

function decodeHtmlAttribute(value: string): string {
  return decodeHtmlEntities(value).replace(/\\"/g, '"');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
