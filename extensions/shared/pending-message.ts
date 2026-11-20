export function paintPendingMessage(text: string): string {
  return `\x1b[48;2;122;92;20;38;2;255;245;214m${text}\x1b[39;49m`;
}
