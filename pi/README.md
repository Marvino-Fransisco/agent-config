# Pi configuration

A collection of extensions and skills for the [Pi coding agent](https://pi.dev/). This is the `pi/` folder of the `agent-config` repository, which also holds `claude/` and `shared/`. It adds terminal UI improvements, a separate read-only Tutor, and tools for keeping track of work across sessions.

**Getting started:** Follow [INSTALL.MD](./docs/INSTALL.MD) to install, reload, and verify the extensions. To remove this configuration, follow [UNINSTALL.md](./docs/UNINSTALL.md).

| Feature | What it does |
| --- | --- |
| Main UI | Adds a startup dashboard, a path/model footer, and `/context` for a breakdown of context usage. |
| [Slash Anywhere](#slash-anywhere) | Run commands or stage skills without submitting the Main draft. Press `Alt+/` to open the picker. |
| Tutor | `/tutor` opens a separate English-language chat for code explanations and read-only workspace investigation. It can put an approved summary into the Main draft without sending it. |
| Teach | `/skill:teach <topic>` in Main builds a learning workspace in the current directory: mission, sources, HTML lessons, references, and learning records. In Tutor, `/teach <topic>` uses the guidance in chat without writing workspace files. |
| Thinking shortcuts | `Shift+↑` raises and `Shift+↓` lowers the current model's thinking level, wrapping in both directions. |
| Last prompt | `/prompt` shows the last message sent from Main, not an unsent draft or a Tutor prompt. |
| [Task memory](extensions/task-memory/README.md) | `/task` tracks ongoing work and supports handoffs across compaction and sessions. |
| [Brainstorming and glossary](#brainstorming-and-project-glossary) | `/skill:brainstorm <prompt>` aligns on a change before coding; `/decision` shows confirmed decisions and coverage; `/glossary` searches project terms. |
| [Specifications](#writing-specifications) | `/skill:spec <request>` drafts or revises a Markdown spec, with or without a brainstorm. |
| [Long-term memory](extensions/long-memory/README.md) | Optional `/memory` extension for searchable global and project notes, with confirmation before writes. |
| Undo send | Gives you a brief window to press `Esc` and return a submitted message to the editor before the agent starts. |

Skills and templates are maintained in [`shared/skills/`](../shared/skills), also used by Claude Code. The shared workflows do not require Pi extensions. Pi's `brainstorming`, `domain_glossary`, and `task` tools are optional ways to track decisions, look up terms, and manage approved work. The [`shared-hook`](extensions/shared-hook/index.ts) extension runs the same pre-tool policy as Claude Code. It applies to Pi's `bash`, `read`, `edit`, and `write` tool calls (including calls routed through Pi's nested tool API), not user shell commands or independent extension tools. It is a guardrail, not a sandbox.

Task memory, Tutor history, and last prompts are stored locally per Git checkout, or per session directory outside Git. Keep Tutor history and last-prompt files out of version control. Tutor uses the active model provider; optional long-term memory uses PostgreSQL and Google embeddings.

## Slash Anywhere

Type `/` after a space or at the start of a line in Main. Use Tab or Enter to select a result. An inline skill or prompt template moves to the start of the draft (for example, `Explain snapshots /teach` becomes `/skill:teach Explain snapshots`). Review and submit it yourself.

Selecting a command such as `/reload` runs it immediately, separately from the draft. Typing without selecting does not run it. Use the regular command line for a command that needs arguments. Extensions that explicitly replace the editor can still change it. `Alt+/` opens the picker without typing a slash.

Slash Anywhere ships with Main UI and was tested on Pi 1.6.0. If another inline-slash extension is installed, use only one to avoid competing editor behavior.

## Brainstorming and project glossary

Start with `/skill:brainstorm <feature or change prompt>`. Pi asks clarifying questions about scope, requirements, business rules, edge cases, impact and acceptance. When the `brainstorming` tool tracks the session, `/decision` opens a top-right panel with confirmed decisions, coverage (`pending`, `discussed`, or `not relevant`), and the approved brief. The panel shows the latest brainstorm on the current Pi session branch. Approving the brief does not authorize implementation. A normal brainstorm offers to draft a spec. To continue directly to drafting after brief approval, request the full flow.

Use `/skill:domain-modeling` to resolve domain terminology or record architecture decisions. Brainstorm uses it after the question rounds when the conversation changes the domain model or surfaces a substantial design decision.

For one domain context, keep terms in `GLOSSARY.md` at the Git root (or Pi's working directory outside Git). For multiple contexts, use a root `GLOSSARY-MAP.md` to link to each context's glossary. The [glossary map format](skills/domain-modeling/GLOSSARY-MAP-FORMAT.md) shows the layout. Commit these files so teammates share the same definitions. Use one `##` heading per term followed by a short definition; `Aliases:` and `Boundary:` are optional. Use comma-separated aliases and keep each entry as plain prose.

```markdown
# Domain glossary

## Purchase Order
Aliases: PO, order request

A buyer's formal request to purchase goods or services.

Boundary: Records a purchase commitment; it is not an invoice.
```

Run `/glossary PO` to look up a term or alias, or `/glossary` to list names. Main and Tutor can call `domain_glossary` to retrieve only matching entries. Both lookups search root `GLOSSARY.md` only; read context-specific glossaries through the map. Lookups are case-insensitive and prefer exact names or aliases, then prefixes. Glossary content is not injected at startup and needs no database or embeddings.

## Writing specifications

Use `/skill:spec <request>` to draft or revise a spec independently. The skill uses [SPEC-TEMPLATE.md](skills/spec/SPEC-TEMPLATE.md) and follows the project’s existing spec location, defaulting to `docs/specs/<slug>.md`. A spec-only request does not change code or task state.

If you request a build, explicitly approve the written spec and proposed task breakdown together. Pi then starts implementation without another confirmation, unless there is conflicting work in progress. With task memory enabled, `/task` can track the approved steps; otherwise the checklist can stay in the conversation.
