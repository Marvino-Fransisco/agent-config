import { constants } from "node:fs";
import { open, opendir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { lastPromptPath } from "../shared/project.ts";
import { tutorHistoryPath } from "./history.ts";

const maxBytes = 512 * 1024;
const maxOutput = 14_000;

function within(root: string, path: string): boolean {
  const part = relative(root, path).toLowerCase();
  if (part === tutorHistoryPath || part.startsWith(`${tutorHistoryPath}${sep}`)) return false;
  if (part === lastPromptPath || part.startsWith(`${lastPromptPath}.`)) return false;
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part) && !part.split(sep).includes(".git");
}

async function localPath(root: string, path: string): Promise<string> {
  const requested = resolve(root, path);
  if (!within(root, requested)) throw new Error("Path is outside the Tutor workspace or in .git or private prompt/Tutor history");
  const actual = await realpath(requested);
  if (!within(root, actual)) throw new Error("Path resolves outside the Tutor workspace or into .git or private prompt/Tutor history");
  return actual;
}

async function readText(path: string): Promise<{ text: string; truncated: boolean; bytes: number } | undefined> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) return undefined;
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const { bytesRead } = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!bytesRead) break;
      bytes += bytesRead;
    }
    const raw = buffer.subarray(0, Math.min(bytes, maxBytes));
    if (raw.includes(0)) return undefined;
    return { text: raw.toString("utf8"), truncated: bytes > maxBytes, bytes };
  } finally {
    await file.close();
  }
}

export async function inspectPath(root: string, path: string, start = 1, count = 120, kind?: "file" | "directory"): Promise<string> {
  const target = await localPath(root, path);
  const label = relative(root, target) || ".";
  const type = await stat(target);
  if (kind === "file" && !type.isFile()) throw new Error("Use read on a regular file or ls on a directory");
  if (kind === "directory" && !type.isDirectory()) throw new Error("Use ls on a directory or read on a file");
  if (type.isDirectory()) {
    const names: string[] = [];
    for await (const entry of await opendir(target)) {
      if (!within(root, join(target, entry.name))) continue;
      names.push(`${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (names.length > 200) break;
    }
    return `${label}/\n${names.slice(0, 200).sort().join("\n")}${names.length > 200 ? "\n[Directory listing limited to 200 entries]" : ""}`.slice(0, maxOutput);
  }
  if (!type.isFile()) throw new Error("Only regular files and directories are supported");
  const result = await readText(target);
  if (!result) throw new Error("Not a regular text file");
  const lines = result.text.split(/\r?\n/);
  if (result.truncated) lines.pop();
  const excerpt = lines.slice(start - 1, start - 1 + count).map((line, offset) => `${start + offset}: ${line}`).join("\n");
  const output = `${label}\n${excerpt || "[No lines in this range]"}`;
  return output.slice(0, maxOutput) + (output.length > maxOutput ? "\n[Output truncated]" : "") +
    (result.truncated ? "\n[Only the first 512 KiB of the file were read]" : "");
}

async function scanWorkspace(root: string, needle: string, path: string, signal: AbortSignal | undefined, mode: "content" | "paths" | "completion") {
  const limit = mode === "completion" ? 20 : 60;
  const matches: string[] = [];
  const deadline = Date.now() + 3500;
  let entries = 0;
  let bytes = 0;
  let excluded = false;
  const limited = () => matches.length >= limit || entries >= 10_000 || bytes >= 32 * 1024 * 1024 || Date.now() >= deadline;
  const skipDirs = new Set(["node_modules", "vendor", "dist", "build", "coverage"]);

  async function visit(candidate: string): Promise<void> {
    signal?.throwIfAborted();
    if (limited()) return;
    const target = await localPath(root, candidate);
    const label = relative(root, target);
    const type = await stat(target);
    if (label && mode === "paths" && label.toLowerCase().includes(needle)) matches.push(label);
    if (type.isDirectory()) {
      for await (const entry of await opendir(target)) {
        signal?.throwIfAborted();
        entries++;
        if (limited()) break;
        if (entry.name.startsWith(".") || entry.isSymbolicLink() || (entry.isDirectory() && skipDirs.has(entry.name))) continue;
        const child = join(target, entry.name);
        if (!within(root, child)) continue;
        if (mode === "completion" && entry.isFile()) {
          const file = relative(root, child);
          if (!/[\x00-\x1f\x7f-\x9f]/.test(file) && file.toLowerCase().includes(needle)) matches.push(file);
        } else if (entry.isFile() || entry.isDirectory()) await visit(child);
      }
      return;
    }
    if (!type.isFile() || mode !== "content") return;
    if (type.size > maxBytes) { excluded = true; return; }
    const result = await readText(target);
    if (!result) return;
    bytes += result.bytes;
    const lines = result.text.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < 60; index++) {
      const position = lines[index].toLowerCase().indexOf(needle);
      if (position >= 0) matches.push(`${label}:${index + 1}: ${lines[index].slice(Math.max(0, position - 30), position + 160)}`);
    }
  }

  await visit(path);
  return { matches, partial: limited() || excluded };
}

export async function searchFiles(root: string, query: string, path = ".", signal?: AbortSignal, namesOnly = false): Promise<string> {
  if (!query.trim()) throw new Error("Enter a non-empty search term");
  const { matches, partial } = await scanWorkspace(root, query.toLowerCase(), path, signal, namesOnly ? "paths" : "content");
  return (matches.join("\n") || "No matches in the scanned files.").slice(0, maxOutput) +
    (partial ? "\n[Partial search; narrow the path or inspect large files directly.]" : "");
}

export async function completeWorkspaceFiles(root: string, query: string, signal: AbortSignal): Promise<string[]> {
  const { matches } = await scanWorkspace(root, query.toLowerCase(), ".", signal, "completion");
  return matches;
}

export function tutorTools(root: string): AgentTool[] {
  function text(value: string) {
    return { content: [{ type: "text" as const, text: value }], details: undefined };
  }
  return [
    {
      name: "read", label: "Read", description: "Read a workspace text file with numbered lines. No writes.",
      parameters: Type.Object({ path: Type.String(), start: Type.Optional(Type.Integer({ minimum: 1 })), count: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) }),
      async execute(_id, args, signal) {
        signal?.throwIfAborted();
        const { path, start, count } = args as { path: string; start?: number; count?: number };
        return text(await inspectPath(root, path, start, count, "file"));
      },
    },
    {
      name: "ls", label: "List", description: "List files and directories in a workspace directory.",
      parameters: Type.Object({ path: Type.Optional(Type.String()) }),
      async execute(_id, args, signal) {
        signal?.throwIfAborted();
        const { path = "." } = args as { path?: string };
        return text(await inspectPath(root, path, 1, 120, "directory"));
      },
    },
    ...(["grep", "find"] as const).map((name): AgentTool => ({
      name, label: name === "grep" ? "Search code" : "Find paths",
      description: `${name === "grep" ? "Find a literal term in workspace text and return file and line references." : "Find workspace paths containing a literal term."} Directory scans skip hidden entries, symlinks, common dependencies and build folders. Narrow path in large projects.`,
      parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), path: Type.Optional(Type.String()) }),
      async execute(_id, args, signal) {
        const { query, path } = args as { query: string; path?: string };
        return text(await searchFiles(root, query, path, signal, name === "find"));
      },
    })),
  ];
}
