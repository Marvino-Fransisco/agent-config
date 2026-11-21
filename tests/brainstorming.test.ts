import assert from "node:assert/strict";
import { test } from "node:test";
import brainstorming from "../extensions/brainstorming/index.ts";

function harness() {
  const branch: unknown[] = [];
  const approvals: string[] = [];
  const panelEvents: string[] = [];
  const handlers = new Map<string, (data: unknown, ctx?: unknown) => void>();
  let approved = false;
  let execute: (id: string, args: unknown, signal: unknown, update: unknown, ctx: unknown) => Promise<{ content: [{ text: string }] }>;
  let command: (args: string, ctx: unknown) => Promise<void>;
  let overlay: { render(width: number): string[]; handleInput(data: string): void } | undefined;
  let anchor: string | undefined;
  const ctx = {
    mode: "tui", hasUI: true,
    sessionManager: { getBranch: () => branch },
    ui: {
      confirm: async (_title: string, message: string) => {
        assert.equal(overlay, undefined, "/decision must close before approval opens");
        panelEvents.push("approval shown");
        approvals.push(message);
        return approved;
      },
      setWidget: (_name: string, factory: (tui: unknown, theme: unknown) => unknown) => factory({
        terminal: { columns: 120, rows: 30 }, requestRender() {},
        showOverlay(component: typeof overlay, options: { anchor: string }) {
          overlay = component;
          anchor = options.anchor;
          return { focus() { panelEvents.push("decision focused"); }, isFocused: () => true, hide() { overlay = undefined; } };
        },
      }, { fg: (_color: string, text: string) => text }),
    },
  };
  brainstorming({
    on: (name: string, handler: (data: unknown, ctx: unknown) => void) => handlers.set(name, handler),
    events: { on: (name: string, handler: (data: unknown) => void) => handlers.set(name, handler), emit: (name: string, data: unknown) => {
      if (name === "ui:dashboard:dismiss") panelEvents.push("dashboard dismissed");
      if (name === "ui:panel:opening" && (data as { name: string }).name === "decision") panelEvents.push("other panels dismissed");
      handlers.get(name)?.(data);
    } },
    registerTool: (tool: { name: string; execute: typeof execute }) => { if (tool.name === "brainstorming") execute = tool.execute; },
    registerCommand: (name: string, definition: { handler: typeof command }) => { if (name === "decision") command = definition.handler; },
    appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
  } as never);
  handlers.get("session_start")?.({}, ctx);
  return {
    branch, approvals, panelEvents, ctx, approve: (value: boolean) => { approved = value; },
    call: async (args: unknown) => (await execute("call", args, undefined, undefined, ctx)).content[0].text,
    panel: () => overlay, anchor: () => anchor,
    open: () => command("", ctx),
    openOtherPanel: () => handlers.get("ui:panel:opening")?.({ name: "context" }),
  };
}

const allCoverage = Object.fromEntries(
  ["goal_and_scope", "requirements", "business_rules", "edge_cases", "impact", "acceptance"].map((field) => [field, { status: "discussed", note: "Reviewed with the user." }]),
);

test("tracks branch coverage and only saves decisions and brief with approval", async () => {
  const h = harness();
  await h.call({ action: "start", topic: "Order expiry" });
  await assert.rejects(h.call({ action: "confirm", brief: "Expiry policy" }), /pending coverage/);
  assert.equal(h.approvals.length, 0);
  await h.open();
  assert.ok(h.panel());
  await h.call({ action: "update", decisions: ["Expire after 2 days"] });
  assert.deepEqual(h.panelEvents.slice(-3), ["dashboard dismissed", "other panels dismissed", "approval shown"]);
  assert.doesNotMatch(await h.call({ action: "read" }), /Expire after 2 days/);

  h.approve(true);
  await h.call({ action: "update", decisions: ["Expire after 3 days"], coverage: { ...allCoverage, impact: { status: "not_relevant", note: "No API change." } } });
  assert.match(h.approvals.at(-1)!, /Proposed:\nD1\. Expire after 3 days/);
  const beforeBrief = h.branch.length;
  h.approve(false);
  await h.open();
  assert.ok(h.panel());
  assert.match(await h.call({ action: "confirm", brief: "Expire unpaid orders after 3 days." }), /not approved/);
  assert.equal(h.branch.length, beforeBrief);
  h.approve(true);
  assert.match(await h.call({ action: "confirm", brief: "Expire unpaid orders after 3 days." }), /Shared understanding: confirmed/);
  assert.match(await h.call({ action: "update", coverage: { requirements: allCoverage.requirements } }), /Shared understanding: confirmed/);
  assert.match(await h.call({ action: "update", coverage: { impact: { status: "pending", note: "Check notifications." } } }), /Shared understanding: pending/);
  h.branch.length = beforeBrief;
  assert.match(await h.call({ action: "read" }), /impact: not relevant — No API change/);
});

test("decision command opens the shared top-right panel and yields to other panels", async () => {
  const h = harness();
  await h.call({ action: "start", topic: "Order expiry" });
  await h.open();
  assert.deepEqual(h.panelEvents, ["dashboard dismissed", "other panels dismissed", "decision focused"]);
  assert.equal(h.anchor(), "top-right");
  assert.match(h.panel()!.render(60).join("\n"), /Order expiry/);
  assert.match(h.panel()!.render(60).join("\n"), /No confirmed decisions/);
  h.openOtherPanel();
  assert.equal(h.panel(), undefined);
});
