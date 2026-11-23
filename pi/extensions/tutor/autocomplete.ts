import { basename } from "node:path";
import { CombinedAutocompleteProvider, type AutocompleteProvider, type SlashCommand } from "@earendil-works/pi-tui";
import { completeWorkspaceFiles } from "./files.ts";

export function tutorAutocomplete(root: string, commands: SlashCommand[], onError: (error: unknown) => void): AutocompleteProvider {
  const native = new CombinedAutocompleteProvider(commands, root);
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const text = (lines[cursorLine] ?? "").slice(0, cursorCol);
      if (cursorLine === 0 && /^\/[a-z-]*$/i.test(text)) {
        return native.getSuggestions(lines, cursorLine, cursorCol, { ...options, force: false });
      }
      const prefix = text.match(/(?:^|\s)(@"[^"\n]*|@[^\s"]*)$/)?.[1];
      if (prefix === undefined) return null;
      try {
        const paths = await completeWorkspaceFiles(root, prefix.replace(/^@"?/, ""), options.signal);
        if (options.signal.aborted || !paths.length) return null;
        return { prefix, items: paths.map((path) => ({
          value: `@${/\s|"/.test(path) ? JSON.stringify(path) : path}`,
          label: basename(path),
          description: path,
        })) };
      } catch (error) {
        if (!options.signal.aborted) onError(error);
        return null;
      }
    },
    applyCompletion: native.applyCompletion.bind(native),
  };
}
