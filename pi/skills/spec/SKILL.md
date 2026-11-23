---
name: spec
description: Draft or revise a project specification and, when requested, hand approved work to task tracking and implementation. Invoke with /skill:spec.
disable-model-invocation: true
---

# Spec

Use [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md). Use the user's request, or the approved brief when handed off from brainstorming. Do not require a brainstorm or pull an unrelated brief into a standalone request. Ask for the change if none was supplied. Inspect relevant project conventions and behavior; clarify material gaps instead of inventing requirements.

Write or revise a short Markdown spec in the project's existing spec location, or `docs/specs/<slug>.md` at the Git root (the working directory outside Git). Use an existing spec for the same change rather than creating a duplicate. Record agreed behavior and acceptance examples, not implementation progress. Report the spec path. If the user only requested a spec, stop without changing code or task state.

## When the user also requests a build

1. Present the written spec and proposed `/task` steps, each with an outcome and a verification check. Ask for one explicit approval covering both. An approved brainstorm brief or an upfront request for the full flow is not that approval.
2. Check `task` with `action: show` before changing task state or starting code. If an unrelated task is active, leave it intact and ask the user to resume and finish it or abandon it. Wait until the conflict is resolved. If the tool is unavailable, report the blocker.
3. After approval and with no conflict, start or update the related task with the approved steps and a reference to the spec. Begin implementation without another confirmation. Track progress and evidence in `/task`, not the spec.
4. If agreed behavior or acceptance criteria change materially, pause affected work, revise the spec and proposed breakdown, and ask for approval again. Reconfirm a brainstorm brief if the change invalidates it. Routine implementation choices do not require reapproval.
