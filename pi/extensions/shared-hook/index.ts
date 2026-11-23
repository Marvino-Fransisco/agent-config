import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const fileTools = { read: "Read", edit: "Edit", write: "Write" } as const;
const unavailable = { block: true, reason: "Could not run the shared block-dangerous hook. Check the checkout and jq installation." } as const;
const blockPrefix = "Blocked by block-dangerous hook: ";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const name = event.toolName;
    let payload: string;
    if (name === "bash") {
      payload = JSON.stringify({ tool_name: "Bash", tool_input: { command: event.input.command } });
    } else if (name === "read" || name === "edit" || name === "write") {
      payload = JSON.stringify({ tool_name: fileTools[name], tool_input: { file_path: event.input.path } });
    } else {
      return;
    }

    let hook: string;
    try {
      const current = await realpath(fileURLToPath(import.meta.url));
      hook = resolve(dirname(current), "../../../shared/hooks/block-dangerous.sh");
    } catch {
      return unavailable;
    }

    return new Promise<{ block: true; reason: string } | undefined>((done) => {
      const child = execFile(hook, [], { cwd: ctx.cwd, signal: ctx.signal, timeout: 5000, maxBuffer: 8192 }, (error, _stdout, stderr) => {
        if (!error) done(undefined);
        else if (error.code === 2 && stderr.startsWith(blockPrefix)) done({ block: true, reason: stderr.trim() });
        else done(unavailable);
      });
      child.stdin?.on("error", () => done(unavailable));
      child.stdin?.end(payload);
    });
  });
}
