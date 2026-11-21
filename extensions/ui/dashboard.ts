import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type OverlayHandle, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";

const CAT = [
	"▟▙        ▟▙",
	"████████████",
	"█▄   ▄▄   ▄█",
	" ▀████████▀ ",
];
const BOTTOM_ROWS = 6;
const FRAMES = 10;
const FRAME_MS = 30;

const rgb = (r: number, g: number, b: number) => (text: string) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
const BRIGHT = rgb(150, 210, 255);
const BLUE = rgb(90, 175, 255);
const MUTED = rgb(70, 125, 185);

export function registerDashboard(pi: ExtensionAPI, getFooterData: () => ReadonlyFooterDataProvider | undefined): void {
	let collapse: (() => void) | undefined;
	let hide: (() => void) | undefined;
	const dismiss = () => {
		hide?.();
		hide = undefined;
		collapse = undefined;
	};
	pi.events?.on?.("ui:tutor:split", dismiss);
	pi.events?.on?.("ui:dashboard:dismiss", dismiss);

	pi.on("session_start", (event, ctx) => {
		collapse = undefined;
		hide = undefined;
		if (ctx.mode !== "tui") return;
		const fresh = (event.reason === "startup" || event.reason === "new")
			&& !ctx.sessionManager.getBranch().some((e) => e.type === "message");
		if (!fresh) {
			ctx.ui.setHeader(undefined);
			return;
		}
		ctx.ui.setHeader((tui) => {
			const dashboard = showDashboard(tui, (width) => rows(ctx, getFooterData, width));
			collapse = dashboard.collapse;
			hide = dashboard.hide;
			return { render: () => [], invalidate() {}, dispose: dashboard.hide };
		});
	});

	pi.on("input", () => {
		collapse?.();
		collapse = undefined;
	});
}

function rows(ctx: ExtensionContext, getFooterData: () => ReadonlyFooterDataProvider | undefined, width: number): string[] {
	const home = process.env.HOME;
	let cwd = ctx.sessionManager.getCwd();
	if (home && cwd.startsWith(home)) cwd = `~${cwd.slice(home.length)}`;
	const branch = getFooterData()?.getGitBranch();
	let model = ctx.model?.id ?? "no model";
	if (ctx.model?.reasoning) model += ` • ${ctx.thinkingLevel || "off"}`;
	const title = `${BRIGHT("pi coding agent")}${MUTED(` v${VERSION}`)}`;
	const details = [title, BLUE(model), MUTED(`${cwd}${branch ? ` (${branch})` : ""}`)];
	const mascot = CAT.map(BLUE);
	const gap = "   ";
	if (width < visibleWidth(`${mascot[0]}${gap}${title}`)) return [...mascot, ...details];
	return mascot.map((line, i) => i === 0 ? line : `${line}${gap}${details[i - 1]}`);
}

function showDashboard(tui: TUI, getRows: (width: number) => string[]) {
	let frame = 0;
	let collapsing = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let handle: OverlayHandle | undefined;
	const options: OverlayOptions = { width: "100%", row: 0, nonCapturing: true };

	const hide = () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		handle?.hide();
		handle = undefined;
	};

	handle = tui.showOverlay({
		invalidate() {},
		render(width: number): string[] {
			const content = getRows(width);
			const blockWidth = Math.max(...content.map(visibleWidth));
			const padding = " ".repeat(Math.max(0, Math.floor((width - blockWidth) / 2)));
			const base = Math.max(0, Math.floor((tui.terminal.rows - BOTTOM_ROWS - content.length) / 2));
			const progress = Math.min(1, frame / FRAMES);
			const row = base - Math.round(progress * progress * (base + content.length));
			options.row = Math.max(0, row);
			const faded = collapsing && progress > 0.3;
			return content.slice(Math.max(0, -row)).map((line) =>
				padding + truncateToWidth(faded ? MUTED(stripVTControlCharacters(line)) : line, width - padding.length, "…"),
			);
		},
	}, options);

	return {
		hide,
		collapse() {
			if (collapsing) return;
			collapsing = true;
			timer = setInterval(() => {
				frame++;
				if (frame >= FRAMES) hide();
				tui.requestRender();
			}, FRAME_MS);
			timer.unref?.();
		},
	};
}
