import { describe, expect, it, vi } from 'vitest';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

import {
  detectAgentCredentials,
  fetchAgentForecasts,
  parseAgentOutput
} from './agent';

vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

const mockExistsSync = vi.mocked(existsSync);

const validPayloads = [
  {
    source: 'MeteoSvizzera',
    date: '2026-06-01',
    temperatureC: 12,
    precipitationMm: 0,
    windSpeedKmh: 15,
    visibilityM: 15000
  },
  {
    source: 'MeteoSvizzera',
    date: '2026-06-02',
    temperatureC: 8,
    precipitationMm: 3.5,
    windSpeedKmh: 30,
    visibilityM: 7000
  }
];

const keyPoint = { latitude: 46.85, longitude: 9.53, elevationM: 2844 };

describe('parseAgentOutput', () => {
  it('parses valid JSON into ForecastPayload[]', () => {
    const result = parseAgentOutput(JSON.stringify(validPayloads));
    expect(result).toEqual({ ok: true, payloads: validPayloads });
  });

  it('fails on non-JSON output', () => {
    const result = parseAgentOutput('not json');
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /JSON parse error/
    );
  });

  it('fails when top level is not an array', () => {
    const result = parseAgentOutput(JSON.stringify({ source: 'x' }));
    expect(result.ok).toBe(false);
  });

  it('fails when a required field is missing', () => {
    const incomplete = [{ source: 'x', date: '2026-06-01', temperatureC: 10 }];
    const result = parseAgentOutput(JSON.stringify(incomplete));
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/index 0/);
  });

  it('ignores extra fields', () => {
    const withExtra = [{ ...validPayloads[0], extraField: 'ignored' }];
    const result = parseAgentOutput(JSON.stringify(withExtra));
    expect(result).toEqual({ ok: true, payloads: [validPayloads[0]] });
  });
});

describe('detectAgentCredentials', () => {
  it('returns codex=true, claude=false when only ~/.codex exists', () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    expect(detectAgentCredentials()).toEqual({ codex: true, claude: false });
  });

  it('returns both true when both dirs exist', () => {
    mockExistsSync.mockReturnValue(true);
    expect(detectAgentCredentials()).toEqual({ codex: true, claude: true });
  });

  it('returns both false when neither dir exists', () => {
    mockExistsSync.mockReturnValue(false);
    expect(detectAgentCredentials()).toEqual({ codex: false, claude: false });
  });
});

describe('fetchAgentForecasts', () => {
  it('returns ForecastPayload[] when runner returns valid JSON', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const runner = vi.fn().mockResolvedValue(JSON.stringify(validPayloads));

    const result = await fetchAgentForecasts(
      'MeteoSvizzera',
      'https://meteosvizzera.admin.ch',
      keyPoint,
      ['2026-06-01', '2026-06-02'],
      runner
    );

    expect(result).toEqual(validPayloads);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds when first call returns invalid JSON', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const runner = vi
      .fn()
      .mockResolvedValueOnce('not valid json')
      .mockResolvedValueOnce(JSON.stringify(validPayloads));

    const result = await fetchAgentForecasts(
      'MeteoSvizzera',
      'https://meteosvizzera.admin.ch',
      keyPoint,
      ['2026-06-01', '2026-06-02'],
      runner
    );

    expect(result).toEqual(validPayloads);
    expect(runner).toHaveBeenCalledTimes(2);
    // Second call should include the validation error
    expect(runner.mock.calls[1][2]).toContain('failed validation with error');
  });

  it('throws when both calls return invalid JSON', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const runner = vi.fn().mockResolvedValue('bad output');

    await expect(
      fetchAgentForecasts(
        'MeteoSvizzera',
        'https://meteosvizzera.admin.ch',
        keyPoint,
        ['2026-06-01'],
        runner
      )
    ).rejects.toThrow(/failed after retry/);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when dates is empty', async () => {
    const runner = vi.fn();
    const result = await fetchAgentForecasts(
      'MeteoSvizzera',
      'https://meteosvizzera.admin.ch',
      keyPoint,
      [],
      runner
    );
    expect(result).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('throws when no agent credentials are detected', async () => {
    mockExistsSync.mockReturnValue(false);
    const runner = vi.fn();

    await expect(
      fetchAgentForecasts(
        'MeteoSvizzera',
        'https://meteosvizzera.admin.ch',
        keyPoint,
        ['2026-06-01'],
        runner
      )
    ).rejects.toThrow(/No agent credentials found/);
  });
});
