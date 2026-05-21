import { readFileSync, mkdtempSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { run } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

// Tasks are passed as a newline-delimited file by run-parallel.sh
const tasksFile = process.env.SANDCASTLE_TASKS_FILE;
if (!tasksFile) {
  console.error('SANDCASTLE_TASKS_FILE env var not set.');
  process.exit(1);
}

const tasks = readFileSync(tasksFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

if (tasks.length === 0) {
  console.error('No tasks found.');
  process.exit(1);
}

const CONCURRENCY = parseInt(process.env.SANDCASTLE_CONCURRENCY ?? '3', 10);

// Copy only auth.json (not config.toml) to a clean temp dir per run.
// Reasons: macOS xattrs on the original prevent Docker Desktop bind-mounts from reading it;
// config.toml is excluded because it sets a model incompatible with ChatGPT-auth exec mode.
const codexSrc = join(homedir(), '.codex');
const codexTmp = mkdtempSync(join(tmpdir(), 'sandcastle-codex-'));
writeFileSync(join(codexTmp, 'auth.json'), readFileSync(join(codexSrc, 'auth.json')));

// Pass the host GH_TOKEN so agents can run `gh issue view` inside the container.
let ghToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
if (!ghToken) {
  try { ghToken = execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch {}
}

const sandbox = docker({
  env: { GH_TOKEN: ghToken },
  mounts: [{ hostPath: codexTmp, sandboxPath: '/home/agent/.codex' }],
});

// Custom agent: omits -m so codex picks the ChatGPT-auth default model.
// Passing any named model via -m fails: "not supported when using Codex with a ChatGPT account".
const codexChatGPT = {
  name: 'codex',
  env: {},
  captureSessions: false,
  buildPrintCommand({ prompt }: { prompt: string }) {
    return {
      command: 'codex exec --json --dangerously-bypass-approvals-and-sandbox',
      stdin: prompt,
    };
  },
  buildInteractiveArgs({ prompt }: { prompt: string }) {
    const args = ['codex'];
    if (prompt) args.push(prompt);
    return args;
  },
  parseStreamLine(line: string) {
    if (!line.startsWith('{')) return [];
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'item.completed' && obj.item?.type === 'agent_message' && typeof obj.item.text === 'string') {
        const text = obj.item.text;
        return [{ type: 'text' as const, text }, { type: 'result' as const, result: text }];
      }
      if (obj.type === 'item.started' && obj.item?.type === 'command_execution' && typeof obj.item.command === 'string') {
        return [{ type: 'tool_call' as const, name: 'Bash', args: obj.item.command }];
      }
      if (obj.type === 'error') {
        const err = obj.error;
        const msg: string | undefined =
          typeof err === 'string' ? err
          : typeof err?.message === 'string' ? err.message
          : typeof obj.message === 'string' ? obj.message
          : undefined;
        return msg ? [{ type: 'result' as const, result: msg }] : [];
      }
    } catch {}
    return [];
  },
};

async function runBatch(tasks: string[]): Promise<void> {
  const queue = tasks.map((task, i) => ({ task, i }));
  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        await run({
          agent: codexChatGPT as never,
          sandbox,
          prompt: item.task,
          name: `task-${item.i + 1}`,
          maxIterations: 10,
        });
      } catch (err) {
        console.error(`task-${item.i + 1} failed:`, (err as Error).message ?? err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
}

console.log(`Running ${tasks.length} task(s) via sandcastle + codex (concurrency: ${CONCURRENCY})...`);
await runBatch(tasks);
console.log('All tasks completed. Review the created branches.');
