import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createNotes } from "../shared/panel.ts";
import { lastPromptPath, resolveProject } from "../shared/project.ts";

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
const displayText = (value: string) => stripVTControlCharacters(value)
  .replace(/\r\n/g, "\n").replaceAll("\t", "  ").split("\n").map((line) => line.replace(/\p{Cc}/gu, "")).join("\n");

function requireDirectory(directory: string) {
  if (!lstatSync(directory).isDirectory()) throw new Error(`Expected a real directory: ${directory}`);
}

function savePrompt(path: string, text: string) {
  const directory = dirname(path);
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  requireDirectory(directory);
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  } catch (error) {
    try { unlinkSync(temp); }
    catch (cleanup) { if (!isMissing(cleanup)) throw cleanup; }
    throw error;
  }
}

function readPrompt(path: string): string {
  try {
    requireDirectory(dirname(path));
    if (!lstatSync(path).isFile()) throw new Error("Last prompt is not a regular file");
    return displayText(readFileSync(path, "utf8")) || "[Prompt hanya berisi lampiran]";
  } catch (error) {
    if (isMissing(error)) return "Belum ada prompt yang tersimpan di project ini.";
    throw error;
  }
}

export default function promptExtension(pi: ExtensionAPI) {
  let panel: ReturnType<typeof createNotes> | undefined;
  const close = () => { panel?.close(); panel = undefined; };

  pi.on("message_start", async ({ message }, ctx) => {
    if (message.role !== "user") return;
    const text = typeof message.content === "string" ? message.content : message.content
      .flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
    try {
      const { root } = await resolveProject(ctx.cwd);
      savePrompt(join(root, lastPromptPath), text);
    } catch (error) {
      ctx.ui.notify(`prompt: ${displayText(error instanceof Error ? error.message : String(error))}`, "error");
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    close();
    if (ctx.mode !== "tui") return;
    const { root } = await resolveProject(ctx.cwd);
    const path = join(root, lastPromptPath);
    ctx.ui.setWidget("prompt-overlay", (tui, theme) => {
      panel?.close();
      panel = createNotes(tui, theme, () => readPrompt(path), (message) => ctx.ui.notify(message, "error"),
        "prompt", () => pi.events.emit("ui:panel:opening", { name: "prompt" }));
      return { invalidate() {}, render: () => [] };
    });
  });
  pi.on("session_shutdown", close);
  pi.events.on("ui:panel:opening", (data) => {
    if ((data as { name: string }).name !== "prompt") panel?.close();
  });
  pi.registerCommand("prompt", {
    description: "Show the last sent prompt in this project",
    handler: async (_args, ctx) => {
      if (panel?.canShow()) panel.open();
      else ctx.ui.notify("/prompt membutuhkan TUI minimal 80 kolom × 12 baris", "warning");
    },
  });
}
