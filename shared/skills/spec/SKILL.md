---
name: spec
description: Write a technical implementation spec (entities, API contract, files to create or change, tests) from the codebase, and when requested hand approved work to task tracking and implementation.
disable-model-invocation: true
---

# Spec

A spec is the technical plan for the code. Brainstorming settles what the feature does for users; the spec settles how the code will do it. Do not restate the brief, link to it. Use [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md). Use the user's request, or the approved brief when handed off from brainstorming. Do not require a brainstorm or pull in an unrelated brief. Ask for the change if none was supplied.

Do not propose a spec for small or obvious changes unless the user explicitly requests one. Propose it for changes that touch several files, entities, contracts, or repos.

## Write the spec

Inspect the code first. Every path, entity, endpoint, and symbol in the spec must be verified to exist, or be marked as new. Follow existing project conventions for naming, layering, and folder structure. Do not invent requirements; send product questions back to the user. List only decisions that the code forces or that need a choice, with a recommendation.

Write the spec in the project's existing spec location, or `docs/specs/<slug>.md` at the Git root (the working directory outside Git). Reuse an existing spec for the same change. Record the technical plan, not progress. Report the spec path. If you cannot inspect the project, ask for the relevant excerpts and mark unverified details as such. If you cannot write files, provide the Markdown in the conversation and state that it was not saved. If the user only requested a spec, stop without changing code or task state.

## When the user also requests a build

1. Present the spec and proposed task steps, each with an outcome and a verification check. Ask for one explicit approval covering both. An approved brainstorm brief or an upfront request for the full flow is not that approval.
2. Before changing task state or starting code, check for work already in progress using the current conversation and any available task list. If there is conflicting work, leave it intact and ask the user whether to finish or set it aside. Wait until the conflict is resolved.
3. After approval and with no conflict, track the approved steps in the existing task list or a checklist in the conversation. Reference the approved spec and record progress and evidence in the checklist, not the spec. Begin implementation without another confirmation if you can make the changes; otherwise explain what remains for the user to do.
4. If the technical plan, agreed behavior, or acceptance criteria change materially, pause affected work, revise the spec and breakdown, and ask for approval again. Reconfirm a brainstorm brief if the change invalidates it. Routine implementation choices do not require reapproval.
