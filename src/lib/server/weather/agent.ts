import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

import type { ForecastPayload } from '$lib/forecast/types';

export type AgentCredentials = {
  codex: boolean;
  claude: boolean;
};

export type SubprocessRunner = (
  command: string,
  args: string[],
  stdin: string
) => Promise<string>;

export type AgentKeyPoint = {
  latitude: number;
  longitude: number;
  elevationM?: number | null;
};

type ParseResult =
  | { ok: true; payloads: ForecastPayload[] }
  | { ok: false; error: string };

export function detectAgentCredentials(): AgentCredentials {
  const home = homedir();
  return {
    codex: existsSync(`${home}/.codex`),
    claude: existsSync(`${home}/.claude`)
  };
}

export function parseAgentOutput(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `JSON parse error: ${raw.slice(0, 200)}` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON array at the top level' };
  }

  const payloads: ForecastPayload[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as Record<string, unknown>;
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.source !== 'string' ||
      typeof item.date !== 'string' ||
      typeof item.temperatureC !== 'number' ||
      typeof item.precipitationMm !== 'number' ||
      typeof item.windSpeedKmh !== 'number' ||
      typeof item.visibilityM !== 'number'
    ) {
      return {
        ok: false,
        error: `Item at index ${i} is missing required fields (source, date, temperatureC, precipitationMm, windSpeedKmh, visibilityM)`
      };
    }
    payloads.push({
      source: item.source,
      date: item.date,
      temperatureC: item.temperatureC,
      precipitationMm: item.precipitationMm,
      windSpeedKmh: item.windSpeedKmh,
      visibilityM: item.visibilityM
    });
  }

  return { ok: true, payloads };
}

function buildPrompt(
  sourceName: string,
  fetchInstructions: string,
  keyPoint: AgentKeyPoint,
  dates: string[]
): string {
  return [
    `You are a weather data extraction agent.`,
    `Fetch daily forecast data for the following location and dates from the source described below.`,
    ``,
    `Location: latitude=${keyPoint.latitude}, longitude=${keyPoint.longitude}${keyPoint.elevationM != null ? `, elevation=${keyPoint.elevationM}m` : ''}`,
    `Dates: ${dates.join(', ')}`,
    `Source name: ${sourceName}`,
    `Fetch instructions: ${fetchInstructions}`,
    ``,
    `Return ONLY a JSON array with one object per date, matching this schema exactly:`,
    `[`,
    `  {`,
    `    "source": "${sourceName}",`,
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

export function defaultSubprocessRunner(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs = 60_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Agent subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`Agent subprocess exited with code ${code}: ${stderr}`)
        );
      } else {
        resolve(stdout);
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export function chooseAgentCommand(): [string, string[]] {
  const creds = detectAgentCredentials();
  if (creds.codex) {
    return ['codex', ['exec']];
  }
  if (creds.claude) {
    return ['claude', ['-p']];
  }
  throw new Error(
    'No agent credentials found (checked ~/.codex and ~/.claude)'
  );
}

export async function fetchAgentForecasts(
  sourceName: string,
  fetchInstructions: string,
  keyPoint: AgentKeyPoint,
  dates: string[],
  runner: SubprocessRunner = (cmd, args, stdin) =>
    defaultSubprocessRunner(cmd, args, stdin)
): Promise<ForecastPayload[]> {
  if (dates.length === 0) {
    return [];
  }

  const [command, args] = chooseAgentCommand();
  const prompt = buildPrompt(sourceName, fetchInstructions, keyPoint, dates);

  const firstOutput = await runner(command, args, prompt);
  const firstResult = parseAgentOutput(firstOutput);
  if (firstResult.ok) {
    return firstResult.payloads;
  }

  // Retry once with validation error appended
  const retryPrompt = `${prompt}\n\nYour previous response failed validation with error: ${firstResult.error}\nPlease correct your output and return only the JSON array.`;
  const retryOutput = await runner(command, args, retryPrompt);
  const retryResult = parseAgentOutput(retryOutput);
  if (retryResult.ok) {
    return retryResult.payloads;
  }

  throw new Error(
    `Agent fetch failed after retry. Last error: ${retryResult.error}`
  );
}
