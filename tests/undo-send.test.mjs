import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/undo-send/index.ts";

function setup(integrated = false) {
  let handler;
  let listener;
  let editor = "";
  let widget;
  const events = [];
  extension({
    on(_event, callback) { handler = callback; },
    events: { emit(name, data) { events.push({ name, text: data.text, indicator: data.indicator }); data.handled = integrated; } },
  });
  const ctx = {
    mode: "tui",
    ui: {
      theme: { bg: (_color, text) => `[bg]${text}[/bg]`, fg: (_color, text) => text },
      setWidget: (_name, value) => { widget = value; },
      getEditorText: () => editor,
      setEditorText: (text) => { editor = text; },
      onTerminalInput: (callback) => {
        listener = callback;
        return () => { listener = undefined; };
      },
    },
  };
  return { handler, ctx, events, getWidget: () => widget, input: (key) => listener?.(key), getEditor: () => editor };
}

const input = { text: "hello", source: "interactive" };

test("Escape restores the message and preserves the editor draft", async () => {
  const { handler, ctx, input: key, getEditor, getWidget } = setup();
  ctx.ui.setEditorText("draft");
  const result = handler(input, ctx);
  assert.equal(key("x"), undefined);
  assert.deepEqual(key("escape"), { consume: true });
  assert.deepEqual(await result, { action: "handled" });
  assert.equal(getEditor(), "hello\n\ndraft");
  assert.equal(getWidget(), undefined);
  assert.equal(key("escape"), undefined);
});

test("preview shows a countdown and is cleared on cancellation", async () => {
  const { handler, ctx, getWidget, input: key } = setup();
  const result = handler(input, ctx);
  assert.equal(getWidget()[0], "[bg]hello[/bg]");
  assert.match(getWidget()[1], /Esc to edit · sending.*1\.5s/);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(Number(getWidget()[1].match(/([\d.]+)s$/)[1]) < 1.5);
  key("escape");
  await result;
  assert.equal(getWidget(), undefined);
});

test("task widget receives and clears the pending message", async () => {
  const { handler, ctx, events, getWidget, input: key } = setup(true);
  const result = handler(input, ctx);
  assert.equal(events[0].text, "hello");
  assert.match(events[0].indicator, /Esc to edit/);
  assert.equal(getWidget(), undefined);
  key("escape");
  await result;
  assert.equal(events.at(-1).text, undefined);
});

test("message proceeds after the cancellation window", async () => {
  const { handler, ctx, getEditor, getWidget, input: key } = setup();
  assert.equal(await handler(input, ctx), undefined);
  assert.equal(getEditor(), "");
  assert.equal(getWidget(), undefined);
  assert.equal(key("escape"), undefined);
});

test("queued, non-interactive, and image messages are not intercepted", async () => {
  const { handler, ctx, events } = setup();
  for (const event of [
    { ...input, streamingBehavior: "steer" },
    { ...input, source: "rpc" },
    { ...input, images: [{}] },
  ]) assert.equal(await handler(event, ctx), undefined);
  assert.equal(events.length, 0);
});
