import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AgentCredentials = {
  codex: boolean;
  claude: boolean;
};

export function detectCredentials(): AgentCredentials {
  const home = homedir();
  return {
    codex: existsSync(join(home, '.codex')),
    claude: existsSync(join(home, '.claude'))
  };
}
