---
name: spec
description: Write a technical implementation spec (entities, API contract, files to create or change, tests) from the codebase, and when requested hand approved work to task tracking and implementation. Invoke with /spec.
disable-model-invocation: true
---

# Spec

A spec is the technical plan for the code. Brainstorming settles what the feature does for users; the spec settles how the code will do it. Do not restate the brief, link to it. Use [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md). Use the user's request, or the approved brief when handed off from brainstorming. Ask for the change if none was supplied.

Skip the spec for small, single-file, or obvious changes and say so; propose it only when the change touches several files, entities, contracts, or repos.

## Write the spec

Inspect the code first. Every path, entity, endpoint, and symbol in the spec must be verified to exist, or be marked as new. Follow existing project conventions for naming, layering, and folder structure. Do not invent requirements; send product questions back to the user. List only decisions that the code forces or that need a choice, with a recommendation.

Write the spec in the project's existing spec location, or `docs/specs/<slug>.md` at the Git root (the working directory outside Git). Reuse an existing spec for the same change. Record the technical plan, not progress. Report the spec path. If the user only requested a spec, stop without changing code or task state.

## When the user also requests a build

1. Present the spec and proposed task steps, each with an outcome and a verification check. Ask for one explicit approval covering both. An approved brainstorm brief or an upfront request for the full flow is not that approval.
2. Review the current task list before changing it or starting code. If unrelated tasks are in progress, leave them intact and ask the user whether to resume them or set them aside. Wait until the conflict is resolved.
3. After approval and with no conflict, create or update the task list with the approved steps and a reference to the spec. Begin implementation without another confirmation. Track progress and evidence in the task list, not the spec.
4. If the technical plan or agreed behavior changes materially, pause affected work, revise the spec and breakdown, and ask for approval again. Routine implementation choices do not require reapproval.
