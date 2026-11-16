import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/undo-send/index.ts";

function setup(integrated = false) {
  let handler;
  let component;
  let editor = "";
  let widget;
  const events = [];
  extension({
    on(_event, callback) { handler = callback; },
    events: { emit(name, data) { events.push({ name, text: data.text }); data.handled = integrated; } },
  });
  const ctx = {
    mode: "tui",
    ui: {
      theme: { bg: (_color, text) => `[bg]${text}[/bg]` },
      setWidget: (_name, value) => { widget = value; },
      getEditorText: () => editor,
      setEditorText: (text) => { editor = text; },
      custom: (factory) => new Promise((resolve) => {
        component = factory({ requestRender() {} }, null, { matches: (data) => data === "escape" }, (value) => {
          component.dispose();
          resolve(value);
        });
      }),
    },
  };
  return { handler, ctx, events, getWidget: () => widget, getComponent: () => component, getEditor: () => editor };
}

const input = { text: "hello", source: "interactive" };

test("Escape restores the message without submitting it", async () => {
  const { handler, ctx, getComponent, getEditor } = setup();
  ctx.ui.setEditorText("draft");
  const result = handler(input, ctx);
  getComponent().handleInput("escape");
  assert.deepEqual(await result, { action: "handled" });
  assert.equal(getEditor(), "hello\n\ndraft");
});

test("pending preview is cleared when the message is cancelled", async () => {
  const { handler, ctx, getWidget, getComponent } = setup();
  const result = handler(input, ctx);
  assert.deepEqual(getWidget(), ["[bg]hello[/bg]"]);
  getComponent().handleInput("escape");
  await result;
  assert.equal(getWidget(), undefined);
});

test("task widget receives and clears the pending message", async () => {
  const { handler, ctx, events, getWidget, getComponent } = setup(true);
  const result = handler(input, ctx);
  assert.deepEqual(events, [{ name: "undo-send:pending", text: "hello" }]);
  assert.equal(getWidget(), undefined);
  getComponent().handleInput("escape");
  await result;
  assert.deepEqual(events[1], { name: "undo-send:pending", text: undefined });
});

test("message proceeds after the cancellation window", async () => {
  const { handler, ctx, getEditor } = setup();
  assert.equal(await handler(input, ctx), undefined);
  assert.equal(getEditor(), "");
});

test("queued, non-interactive, and image messages are not intercepted", async () => {
  const { handler, ctx, getComponent } = setup();
  for (const event of [
    { ...input, streamingBehavior: "steer" },
    { ...input, source: "rpc" },
    { ...input, images: [{}] },
  ]) assert.equal(await handler(event, ctx), undefined);
  assert.equal(getComponent(), undefined);
});
