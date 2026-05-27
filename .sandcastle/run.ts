import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  writeFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { homedir, tmpdir } from 'os';
import { run } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

const tasksFile = process.env.SANDCASTLE_TASKS_FILE;
if (!tasksFile) {
  console.error('SANDCASTLE_TASKS_FILE env var not set.');
  process.exit(1);
}

const stage = process.env.SANDCASTLE_STAGE;
if (stage !== 'implementer' && stage !== 'reviewer') {
  console.error('SANDCASTLE_STAGE must be "implementer" or "reviewer".');
  process.exit(1);
}

const worktreeDir = process.env.SANDCASTLE_WORKDIR;
if (!worktreeDir) {
  console.error('SANDCASTLE_WORKDIR env var not set.');
  process.exit(1);
}

const prompt = readFileSync(tasksFile, 'utf8').trim();
if (!prompt) {
  console.error('Empty prompt in SANDCASTLE_TASKS_FILE.');
  process.exit(1);
}

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

// Derive the Docker image name from the main project root, not the worktree.
// When run inside a worktree (.worktrees/issue-N-slug), process.cwd() is the
// worktree path whose basename differs from the image that was built from the
// main project (sandcastle:<project-basename>). SANDCASTLE_ROOT is forwarded
// by run-parallel.sh to pin the image name to the correct project.
const sandcastleRoot = process.env.SANDCASTLE_ROOT ?? worktreeDir;
const imageName = `sandcastle:${basename(sandcastleRoot)}`;

const sandbox = docker({
  imageName,
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

console.log(`Running sandcastle stage: ${stage} in ${worktreeDir}`);

const logsDir = join(worktreeDir, '.sandcastle', 'logs');

// Stream the inner sandcastle log to stdout in real time so the outer log
// (which captures this process's stdout) stays live during long runs.
// Polls logsDir every 200 ms until a *-<stage>.log file appears, then reads
// new bytes as they arrive. Drains remaining content after `done` settles.
function streamInnerLog(done: Promise<unknown>): void {
  let logPath: string | undefined;
  let position = 0;

  function tick(): void {
    try {
      if (!logPath) {
        const files = readdirSync(logsDir);
        const match = files.find(f => f.endsWith(`-${stage}.log`));
        if (match) {
          logPath = join(logsDir, match);
          console.log(`[stream] ${logPath}`);
        }
      }
      if (logPath) {
        const size = statSync(logPath).size;
        if (size > position) {
          const buf = Buffer.alloc(size - position);
          const fd = openSync(logPath, 'r');
          readSync(fd, buf, 0, buf.length, position);
          closeSync(fd);
          process.stdout.write(buf);
          position = size;
        }
      }
    } catch {}
  }

  const interval = setInterval(tick, 200);
  done.finally(() => {
    clearInterval(interval);
    tick(); // final drain
  });
}

let runError: unknown;
const runPromise = run({
  agent: codexChatGPT as never,
  sandbox,
  cwd: worktreeDir,
  prompt,
  name: stage,
  maxIterations: Number(process.env.SANDCASTLE_MAX_ITERATIONS ?? '1'),
}).catch((err: unknown) => { runError = err; });

streamInnerLog(runPromise);

await runPromise;

if (runError) {
  console.error(`Stage ${stage} failed:`, (runError as Error).message ?? runError);
  process.exit(1);
}

console.log(`Stage ${stage} completed.`);
