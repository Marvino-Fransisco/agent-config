import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import brainstorming from "../extensions/brainstorming/index.ts";

function harness(cwd: string) {
  const ctx = { cwd, ui: { notify: (message: string) => { text = message; } } };
  let text: string;
  let command: (query: string, ctx: unknown) => Promise<void>;
  let execute: (id: string, params: { query: string }, signal: unknown, update: unknown, ctx: unknown) => Promise<{ content: [{ text: string }] }>;
  brainstorming({
    on() {}, events: { on() {}, emit() {} },
    registerCommand: (name: string, definition: { handler: typeof command }) => { if (name === "glossary") command = definition.handler; },
    registerTool: (tool: { name: string; execute: typeof execute }) => { if (tool.name === "domain_glossary") execute = tool.execute; },
  } as never);
  return {
    command: async (query: string) => { await command(query, ctx); return text; },
    lookup: async (query: string) => (await execute("id", { query }, undefined, undefined, ctx)).content[0].text,
  };
}

test("human and agent glossary lookups read only relevant entries from the Git root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-glossary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  const nested = join(root, "packages");
  await mkdir(nested);
  const file = join(root, "GLOSSARY.md");
  const h = harness(nested);
  assert.match(await h.lookup("PO"), /No project glossary/);
  await writeFile(join(nested, "GLOSSARY.md"), "## PO\nWrong root.\n");
  await writeFile(file, "# Domain glossary\r\n\r\n## Purchase Order\r\nAliases: PO, order request\r\n\r\nA buyer's request to purchase.\r\n\r\nBoundary: Not an invoice.\r\n\r\n## Pending Order\r\nAliases: PO pending\r\n\r\nAn order awaiting approval.\r\n\r\n## Invoice\r\nRequests payment.\r\n");
  const exact = await h.lookup(" ＰＯ ");
  assert.match(exact, /^## Purchase Order/);
  assert.match(exact, /Boundary: Not an invoice/);
  assert.doesNotMatch(exact, /## Pending Order|Requests payment|Wrong root/);
  assert.match(await h.lookup("order req"), /## Purchase Order/);
  assert.equal(await h.command("invoice"), "## Invoice\nRequests payment.");
  assert.equal(await h.command(""), "- Purchase Order\n- Pending Order\n- Invoice");
  assert.match(await h.lookup("refund"), /No glossary matches/);
  await assert.rejects(h.lookup("  "), /Specify a domain term/);

  await writeFile(file, Array.from({ length: 6 }, (_, i) => `## Shipment ${i}\nA shipment.\n`).join("\n"));
  assert.match(await h.lookup("shipment"), /1 more matches/);
  assert.doesNotMatch(await h.lookup("shipment"), /Shipment 5/);
  await rm(file);
  await symlink(join(nested, "GLOSSARY.md"), file);
  await assert.rejects(h.lookup("PO"), /must be a regular file/);
});
