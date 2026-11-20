import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TutorMessage = { role: "user" | "assistant"; text: string };

export interface TutorHistory {
  id: string;
  title: string;
  updatedAt: string;
  messages: TutorMessage[];
}

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const tutorHistoryPath = join(".pi", "tutor-history");

export function createTutorStore(root: string) {
  const folder = join(root, tutorHistoryPath);

  function checkFolder(create = false) {
    for (const path of [dirname(folder), folder]) {
      if (create) {
        try { mkdirSync(path, { mode: 0o700 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      }
      if (!lstatSync(path).isDirectory()) throw new Error(`Tutor history requires a real directory: ${path}`);
    }
  }

  function file(id: string): string {
    if (!validId.test(id)) throw new Error("Invalid Tutor session ID");
    return join(folder, `${id}.json`);
  }

  function load(id: string): TutorHistory {
    const path = file(id);
    checkFolder();
    if (!lstatSync(path).isFile()) throw new Error(`Invalid Tutor history: ${id}.json`);
    const history = JSON.parse(readFileSync(path, "utf8")) as TutorHistory;
    if (history?.id !== id || typeof history.title !== "string" || typeof history.updatedAt !== "string" ||
      !Array.isArray(history.messages) || !history.messages.every((message) =>
        (message?.role === "user" || message?.role === "assistant") && typeof message.text === "string")) {
      throw new Error(`Invalid Tutor history: ${id}.json`);
    }
    return history;
  }

  function list(): TutorHistory[] {
    try { checkFolder(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && validId.test(entry.name.slice(0, -5)))
      .map((entry) => entry.name)
      .flatMap((name) => {
        try { return [load(name.slice(0, -5))]; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function save(history: TutorHistory): TutorHistory {
    const target = file(history.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(history, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(temp, target);
    } catch (error) {
      try { unlinkSync(temp); }
      catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") throw cleanup; }
      throw error;
    }
    return history;
  }

  function locked<T>(id: string, action: () => T): T {
    const lock = `${file(id)}.lock`;
    checkFolder();
    try { mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      throw new Error(`Tutor history is locked: ${lock}`);
    }
    try { return action(); }
    finally { rmdirSync(lock); }
  }

  return {
    list,
    load,
    create(title: string, message: TutorMessage) {
      checkFolder(true);
      return save({ id: randomUUID(), title, updatedAt: new Date().toISOString(), messages: [message] });
    },
    rename(id: string, title: string) {
      return locked(id, () => save({ ...load(id), title, updatedAt: new Date().toISOString() }));
    },
    append(id: string, message: TutorMessage) {
      return locked(id, () => {
        const history = load(id);
        return save({ ...history, messages: [...history.messages, message], updatedAt: new Date().toISOString() });
      });
    },
    remove(id: string) { locked(id, () => unlinkSync(file(id))); },
  };
}
