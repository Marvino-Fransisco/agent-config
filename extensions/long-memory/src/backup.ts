import { execFile, spawn } from "node:child_process";
import { chmodSync, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const BACKUP_DIR = join(homedir(), ".pi", "agent", "long-memory", "backups");
const PATTERN = /^pi_memory-\d{8}T\d{6}Z\.dump$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 120000;
const run = promisify(execFile);

export function listBackups(dir = BACKUP_DIR): string[] {
  try {
    return readdirSync(dir).filter((name) => PATTERN.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function backupDue(dir = BACKUP_DIR, now = Date.now()): boolean {
  const newest = listBackups(dir).at(-1);
  return !newest || now - statSync(join(dir, newest)).mtimeMs >= DAY_MS;
}

export function pruneBackups(dir: string, keep: number): string[] {
  const removed = listBackups(dir).slice(0, -keep);
  for (const name of removed) rmSync(join(dir, name));
  return removed;
}

export async function backupDatabase(keep: number, dir = BACKUP_DIR): Promise<string> {
  const { stdout } = await run("docker", [
    "ps", "--format", "{{.ID}}",
    "--filter", "label=com.docker.compose.project=long-memory",
    "--filter", "label=com.docker.compose.service=postgres",
    "--filter", "label=com.docker.compose.oneoff=False",
  ], { timeout: 10_000 });
  const containers = stdout.trim().split(/\s+/).filter(Boolean);
  if (containers.length !== 1) {
    throw new Error(`Expected one running long-memory PostgreSQL container, found ${containers.length}`);
  }

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = join(dir, `pi_memory-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.dump`);
  const partial = `${file}.partial`;
  return new Promise((resolve, reject) => {
    const out = createWriteStream(partial, { mode: 0o600 });
    const written = new Promise<void>((done) => out.on("close", () => done()));
    const child = spawn("docker", ["exec", containers[0], "pg_dump", "-U", "memory_owner", "-d", "pi_memory", "-Fc"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.destroy();
      rmSync(partial, { force: true });
      reject(error);
    };
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.stdout?.pipe(out);
    child.on("error", (error) => fail(new Error(`Backup could not start docker: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) { fail(new Error(`pg_dump failed (exit ${code}): ${stderr.trim() || "no output"}`)); return; }
      void written.then(() => {
        if (settled) return;
        if (statSync(partial).size === 0) { fail(new Error("pg_dump produced an empty backup")); return; }
        settled = true;
        clearTimeout(timer);
        renameSync(partial, file);
        pruneBackups(dir, keep);
        resolve(file);
      });
    });
  });
}
