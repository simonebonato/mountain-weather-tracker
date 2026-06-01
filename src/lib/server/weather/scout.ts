import type { ForecastPayload } from '$lib/forecast/types';
import {
  chooseAgentCommand,
  defaultSubprocessRunner,
  type AgentKeyPoint,
  type SubprocessRunner
} from './agent';

export type ScoutResult = {
  sourceName: string;
  geographicMatchScore: number;
  domainSpecialtyScore: number;
  payloads: ForecastPayload[];
};

type ParseResult =
  | { ok: true; results: ScoutResult[] }
  | { ok: false; error: string };

const KNOWN_SOURCES = [
  'MeteoSvizzera',
  'ZAMG',
  'Météo-France',
  'SRF Meteo',
  'yr.no',
  'Meteoblue'
];

export function buildScoutPrompt(
  keyPoint: AgentKeyPoint,
  activity: string,
  scoutingNotes: string,
  dates: string[]
): string {
  const elevationLine =
    keyPoint.elevationM != null ? `, elevation=${keyPoint.elevationM}m` : '';
  const notesLine =
    scoutingNotes.length > 0 ? `\nAdditional context: ${scoutingNotes}` : '';

  return [
    `You are a weather source discovery and data extraction agent.`,
    `Your task is to autonomously find and fetch weather forecast data from multiple sources for a given location and activity.`,
    ``,
    `Location: latitude=${keyPoint.latitude}, longitude=${keyPoint.longitude}${elevationLine}`,
    `Activity: ${activity}`,
    `Dates: ${dates.join(', ')}${notesLine}`,
    ``,
    `Known regional weather services to consider:`,
    KNOWN_SOURCES.map((s) => `  - ${s}`).join('\n'),
    ``,
    `You may discover additional sources beyond the ones listed above if they are relevant to the location and activity.`,
    ``,
    `For each source you consult, evaluate:`,
    `1. Geographic match score (0.0-1.0): How well does this source cover the given location?`,
    `2. Domain specialty score (0.0-1.0): How specialized is this source for the given activity?`,
    ``,
    `Return ONLY a JSON array with one object per source-date combination, matching this schema exactly:`,
    `[`,
    `  {`,
    `    "sourceName": "string",`,
    `    "geographicMatchScore": <number 0.0-1.0>,`,
    `    "domainSpecialtyScore": <number 0.0-1.0>,`,
    `    "date": "YYYY-MM-DD",`,
    `    "temperatureC": <number>,`,
    `    "precipitationMm": <number>,`,
    `    "windSpeedKmh": <number>,`,
    `    "visibilityM": <number>`,
    `  }`,
    `]`,
    `Do not include any explanation, markdown, or text outside the JSON array.`
  ].join('\n');
}

function parseScoutOutputInternal(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `JSON parse error: ${raw.slice(0, 200)}` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON array at the top level' };
  }

  const resultsBySource = new Map<
    string,
    {
      geographicMatchScore: number;
      domainSpecialtyScore: number;
      payloads: ForecastPayload[];
    }
  >();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as Record<string, unknown>;

    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.sourceName !== 'string' ||
      typeof item.geographicMatchScore !== 'number' ||
      typeof item.domainSpecialtyScore !== 'number' ||
      typeof item.date !== 'string' ||
      typeof item.temperatureC !== 'number' ||
      typeof item.precipitationMm !== 'number' ||
      typeof item.windSpeedKmh !== 'number' ||
      typeof item.visibilityM !== 'number'
    ) {
      continue;
    }

    const sourceName = item.sourceName;
    const payload: ForecastPayload = {
      source: sourceName,
      date: item.date,
      temperatureC: item.temperatureC,
      precipitationMm: item.precipitationMm,
      windSpeedKmh: item.windSpeedKmh,
      visibilityM: item.visibilityM
    };

    if (!resultsBySource.has(sourceName)) {
      resultsBySource.set(sourceName, {
        geographicMatchScore: item.geographicMatchScore,
        domainSpecialtyScore: item.domainSpecialtyScore,
        payloads: []
      });
    }

    const result = resultsBySource.get(sourceName)!;
    result.payloads.push(payload);
  }

  const results: ScoutResult[] = Array.from(resultsBySource.entries()).map(
    ([sourceName, data]) => ({
      sourceName,
      geographicMatchScore: data.geographicMatchScore,
      domainSpecialtyScore: data.domainSpecialtyScore,
      payloads: data.payloads
    })
  );

  return { ok: true, results };
}

export function parseScoutOutput(raw: string): ScoutResult[] {
  const result = parseScoutOutputInternal(raw);
  if (result.ok) {
    return result.results;
  }
  return [];
}

export async function fetchScoutForecasts(
  keyPoint: AgentKeyPoint,
  activity: string,
  scoutingNotes: string,
  dates: string[],
  runner: SubprocessRunner = (cmd, args, stdin) =>
    defaultSubprocessRunner(cmd, args, stdin)
): Promise<ScoutResult[]> {
  if (dates.length === 0) {
    return [];
  }

  const [command, args] = chooseAgentCommand();
  const prompt = buildScoutPrompt(keyPoint, activity, scoutingNotes, dates);

  const firstOutput = await runner(command, args, prompt);
  const firstResults = parseScoutOutput(firstOutput);
  if (firstResults.length > 0 || firstOutput.trim() === '[]') {
    return firstResults;
  }

  // Retry once with validation error appended
  const retryPrompt = `${prompt}\n\nYour previous response failed validation. Please ensure you return ONLY a valid JSON array with the required fields.`;
  const retryOutput = await runner(command, args, retryPrompt);
  const retryResults = parseScoutOutput(retryOutput);
  if (retryResults.length > 0 || retryOutput.trim() === '[]') {
    return retryResults;
  }

  throw new Error(`Scout agent fetch failed after retry`);
}
