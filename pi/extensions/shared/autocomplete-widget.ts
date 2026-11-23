import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function autocompleteTitle(pane: "Main" | "Tutor", commands: boolean) {
  return commands ? `${pane} commands` : "Find files";
}

export function autocompleteHint(_pane: "Main" | "Tutor", commands: boolean) {
  return `↑↓ Select · Enter ${commands ? "Run" : "Insert"} · Tab Complete · Esc Close`;
}

export function ruleText(width: number, label = "") {
  const title = label ? truncateToWidth(` ${label} `, width, "…") : "";
  return `${title}${"─".repeat(Math.max(0, width - visibleWidth(title)))}`;
}
