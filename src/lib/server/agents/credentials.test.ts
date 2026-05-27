import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('node:os', () => ({ homedir: () => '/home/user' }));
vi.mock('node:fs');

import { detectCredentials } from './credentials';
import * as fs from 'node:fs';

describe('detectCredentials', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it('returns both false when neither directory exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(detectCredentials()).toEqual({ codex: false, claude: false });
  });

  it('returns codex true when only ~/.codex exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.codex')
    );
    expect(detectCredentials()).toEqual({ codex: true, claude: false });
  });

  it('returns claude true when only ~/.claude exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.claude')
    );
    expect(detectCredentials()).toEqual({ codex: false, claude: true });
  });

  it('returns both true when both directories exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(detectCredentials()).toEqual({ codex: true, claude: true });
  });
});
