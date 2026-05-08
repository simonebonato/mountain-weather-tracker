import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

await sandcastle.run({
sandbox: docker({ 
    containerUid: 1000, 
    mounts: [
    { hostPath: "~/.codex", sandboxPath: "~/.codex" },
  ],}),
  name: "codex-smoke-test",
  maxIterations: 1,
  agent: sandcastle.codex("gpt-5.4-mini"),
  prompt: `
Do not edit files.
Run: codex --version
Then run: codex exec --json -m gpt-5.4-mini "Say auth works and make a joke."
Report the result.
`,
});