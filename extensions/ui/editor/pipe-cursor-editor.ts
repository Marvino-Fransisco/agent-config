import { stripVTControlCharacters } from "node:util";
import { CustomEditor, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, wrapTextWithAnsi, type AutocompleteProvider, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { autocompleteHint, autocompleteTitle, ruleText } from "../../shared/autocomplete-widget.ts";
import { slashToken, type createSlashAnywhere } from "./slash-anywhere.ts";

const BLUE_RAIL = "\x1b[38;2;90;175;255m│\x1b[39m ";

export class PipeCursorEditor extends CustomEditor {
	private confirmAbort: "inline" | "widget" | undefined;
	private inputRules: [number, number] | undefined;
	private menuRows: { start: number; count: number; box: number; boxStart: number; offset: number } | undefined;
	private readonly run: Pick<ExtensionContext, "isIdle" | "abort"> & {
		placeAbortPrompt?: (render?: (width: number) => string[]) => boolean;
		slashAnywhere?: ReturnType<typeof createSlashAnywhere>;
	};
	private readonly bindings: ConstructorParameters<typeof CustomEditor>[2];

	constructor(run: PipeCursorEditor["run"], ...args: ConstructorParameters<typeof CustomEditor>) {
		super(...args);
		this.run = run;
		this.bindings = args[2];
	}

	setAutocompleteProvider(provider: AutocompleteProvider): void {
		super.setAutocompleteProvider(this.run.slashAnywhere?.wrap(provider, this) ?? provider);
	}

	pickSlash(): Promise<void> | undefined {
		return this.run.slashAnywhere?.pick(this);
	}

	private currentSlashToken() {
		if (!this.run.slashAnywhere) return;
		const { line, col } = this.getCursor();
		return slashToken(this.getLines(), line, col);
	}

	clearAbortConfirmation(): void {
		if (!this.confirmAbort) return;
		const inWidget = this.confirmAbort === "widget";
		this.confirmAbort = undefined;
		if (inWidget) this.run.placeAbortPrompt?.();
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		const interrupt = this.bindings.matches(data, "app.interrupt");
		if (this.confirmAbort) {
			this.clearAbortConfirmation();
			if (!this.run.isIdle()) {
				if (matchesKey(data, "enter")) {
					this.run.abort();
					return;
				}
				if (interrupt || matchesKey(data, "escape")) return;
			}
		}
		if (interrupt && !this.isShowingAutocomplete() && !this.run.isIdle()) {
			this.confirmAbort = this.run.placeAbortPrompt?.((width) => this.renderAbortPrompt(width)) ? "widget" : "inline";
			this.tui.requestRender();
			return;
		}
		const wasCompleting = this.isShowingAutocomplete();
		super.handleInput(data);
		if (!wasCompleting && /^[\w/:-]$/.test(data) && this.currentSlashToken()?.inline) {
			const trigger = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(CustomEditor.prototype), "tryTriggerAutocomplete")?.value;
			if (typeof trigger === "function") trigger.call(this);
		}
	}

	handleMouse(event: TuiMouseEvent) {
		const menu = this.menuRows;
		if (!menu) return super.handleMouse(event);
		const y = event.y - menu.offset;
		if (y >= menu.start && y < menu.start + menu.count) {
			return super.handleMouse({ ...event, y: menu.box + y - menu.start });
		}
		if (y >= menu.boxStart) return super.handleMouse({ ...event, y: y - menu.boxStart });
		return undefined;
	}

	isInputRule(row: number): boolean {
		return this.inputRules?.includes(row) ?? false;
	}

	render(width: number): string[] {
		let lines = super.render(width);
		this.menuRows = undefined;
		let boxBottom = lines.length - 1;

		// Move the @/"/" autocomplete suggestion list (files, skills, commands)
		// from below the input box to above it. The base Editor always appends
		// it after the bottom border, so detect the bottom-border line and split
		// there: everything after it is the autocomplete block.
		//
		// IMPORTANT: the border test must be strict. An earlier version allowed
		// [a-z0-9] in the pattern, which false-matched ordinary lowercase editor
		// content (e.g. typed text, skill/command names) as "the border" and
		// split at the wrong line — that was the reported bug. A real border is
		// only the '─' box-drawing char, optionally with a scroll indicator like
		// "─── ↓ 3 more ───" (arrow + digits + literal "more", still dash-framed).
		// Real content essentially never consists solely of '─'.
		if (this.isShowingAutocomplete()) {
			const BORDER_RE = /^(?=.*─)\s*─*\s*(?:[↑↓]\s*\d+\s*more\s*─*\s*)?$/i;
			let borderIndex = -1;
			for (let i = lines.length - 1; i >= 0; i--) {
				const stripped = stripVTControlCharacters((lines[i] ?? "").replaceAll("\x1b_pi:c\x07", ""));
				if (BORDER_RE.test(stripped)) {
					borderIndex = i;
					break;
				}
			}
			boxBottom = borderIndex;
			if (borderIndex !== -1 && borderIndex < lines.length - 1) {
				const box = lines.slice(0, borderIndex + 1);
				const autocomplete = lines.slice(borderIndex + 1);
				const slash = this.run.slashAnywhere ? Boolean(this.currentSlashToken()) : /^\s*\/[^\s/]*$/.test(this.getText());
				const menu = [
					this.borderColor(ruleText(width, autocompleteTitle("Main", slash))),
					...autocomplete,
					truncateToWidth(this.run.slashAnywhere && slash ? "↑↓ Select · Enter/Tab: run command or stage skill · Esc Close" : autocompleteHint("Main", slash), width),
				];
				this.menuRows = { start: 1, count: autocomplete.length, box: box.length, boxStart: menu.length, offset: 0 };
				lines = [...menu, ...box];
			}
		}

		if (this.confirmAbort && this.run.isIdle()) this.confirmAbort = undefined;
		const prompt = this.confirmAbort === "inline" ? this.renderAbortPrompt(width) : [];
		if (this.menuRows) this.menuRows.offset = prompt.length;
		const boxStart = (this.menuRows?.boxStart ?? 0) + prompt.length;
		this.inputRules = boxBottom >= 2 ? [boxStart, boxStart + boxBottom] : undefined;
		return prompt.length ? [...prompt, ...lines] : lines;
	}

	private renderAbortPrompt(width: number): string[] {
		if (!this.confirmAbort || width <= 2 || this.run.isIdle()) return [];
		const heading = wrapTextWithAnsi("Abort current run?", width - 2).map((line) => `${BLUE_RAIL}\x1b[1m${line}\x1b[22m`);
		const actions = wrapTextWithAnsi("Enter to abort · Esc to keep running", width - 2).map((line) => BLUE_RAIL + line);
		return [...heading, ...actions];
	}
}

