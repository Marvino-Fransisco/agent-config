# Pi configuration

A collection of extensions and a teaching skill for the [Pi coding agent](https://pi.dev/). It adds terminal UI improvements, a separate read-only Tutor, and tools for keeping track of work across sessions.

**Getting started:** Follow [INSTALLATION.MD](INSTALLATION.MD) to install, reload, and verify the extensions. The same guide can be followed by an agent on your behalf.

| Feature | What it does |
| --- | --- |
| Main UI | Adds a startup dashboard, a path/model footer, and `/context` for a breakdown of context usage. |
| Tutor | `/tutor` opens a separate English-language chat for code explanations and read-only workspace investigation. It can put an approved summary into the Main draft without sending it. |
| Last prompt | `/prompt` shows the last message sent from Main, not an unsent draft or a Tutor prompt. |
| [Task memory](extensions/task-memory/README.md) | `/task` tracks ongoing work and supports handoffs across compaction and sessions. |
| [Long-term memory](extensions/long-memory/README.md) | Optional `/memory` extension for searchable global and project notes, with confirmation before writes. |
| Undo send | Gives you a brief window to press `Esc` and return a submitted message to the editor before the agent starts. |

Task memory, Tutor history, and last prompts are stored locally per Git checkout, or per session directory outside Git. Keep Tutor history and last-prompt files out of version control. Tutor uses the active model provider; optional long-term memory uses PostgreSQL and Google embeddings.
