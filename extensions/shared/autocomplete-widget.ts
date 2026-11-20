import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function autocompleteTitle(pane: "Main" | "Tutor", commands: boolean) {
  if (pane === "Tutor") return commands ? "Tutor commands" : "Find files";
  return commands ? "Perintah Main" : "Cari file Main";
}

export function autocompleteHint(pane: "Main" | "Tutor", commands: boolean) {
  if (pane === "Tutor") return `↑↓ Select · Enter ${commands ? "Run" : "Insert"} · Tab Complete · Esc Close`;
  return `↑↓ Pilih · Enter ${commands ? "Jalankan" : "Sisipkan"} · Tab Lengkapi · Esc Tutup`;
}

export function ruleText(width: number, label = "") {
  const title = label ? truncateToWidth(` ${label} `, width, "…") : "";
  return `${title}${"─".repeat(Math.max(0, width - visibleWidth(title)))}`;
}
