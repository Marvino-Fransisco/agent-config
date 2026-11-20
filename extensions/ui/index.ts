import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PipeCursorEditor } from "./editor/pipe-cursor-editor.ts";
import { installContextFooter } from "./footer/context-footer.ts";
import { installTopbar } from "./widget/topbar.ts";
import { registerContextCommand } from "./context.ts";
import { registerDashboard } from "./dashboard.ts";
import { registerUsageCommand } from "./usage.ts";

export default function (pi: ExtensionAPI) {
	registerContextCommand(pi);
	registerUsageCommand(pi);
	let getFooterData: ReturnType<typeof installContextFooter> | undefined;
	let editor: PipeCursorEditor | undefined;
	registerDashboard(pi, () => getFooterData?.());
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => (editor = new PipeCursorEditor({
			isIdle: ctx.isIdle,
			abort: ctx.abort,
			placeAbortPrompt: (render) => {
				const prompt = { render, handled: false };
				pi.events?.emit("ui:abort-prompt", prompt);
				return prompt.handled;
			},
		}, tui, theme, kb)));
		getFooterData = installContextFooter(ctx);
		installTopbar(ctx, getFooterData);
	});
	pi.on("agent_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const request = { available: false };
		pi.events?.emit("task-memory:footer:available", request);
		ctx.ui.setWorkingVisible(!request.available);
	});
	pi.on("agent_settled", () => editor?.clearAbortConfirmation());
	pi.on("session_shutdown", (_event, ctx) => {
		editor = undefined;
		if (ctx.mode === "tui") ctx.ui.setWorkingVisible(true);
	});
}
