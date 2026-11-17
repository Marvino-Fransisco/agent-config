import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

export interface ProjectIdentity {
  root: string;
  name: string;
  kind: "git repository" | "folder scope";
}

const execFileAsync = promisify(execFile);
const projects = new Map<string, Promise<ProjectIdentity>>();

export function resolveProject(cwd: string): Promise<ProjectIdentity> {
  const key = resolve(cwd);
  let project = projects.get(key);
  if (!project) {
    project = discoverProject(key);
    projects.set(key, project);
    void project.catch(() => projects.delete(key));
  }
  return project;
}

async function discoverProject(cwd: string): Promise<ProjectIdentity> {
  const directory = await realpath(resolve(cwd));
  try {
    const result = await execFileAsync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 5000 });
    const root = await realpath(result.stdout.trim());
    return { root, name: basename(root), kind: "git repository" };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (!failure.stderr?.includes("not a git repository")) throw error;
    return { root: directory, name: basename(directory), kind: "folder scope" };
  }
}

export function canonicalFilePath(file: string): string {
  const absolute = resolve(file);
  try { return realpathSync(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(absolute) === absolute) throw error;
    return join(canonicalFilePath(dirname(absolute)), basename(absolute));
  }
}

export function projectText(project: ProjectIdentity): string {
  return `Project: ${project.name} · ${project.kind}\nPath: ${project.root}`;
}
