# Engineering flow: brainstorm, spec, and task execution

## Goal and scope

Add a reusable spec-writing stage between an agreed direction and implementation. Brainstorming, writing a spec, and tracking work remain independently usable. The approved brainstorm brief serves as the idea; the spec records agreed behavior; `/task` tracks execution and verification. No separate idea document, ticket files, code-review stage, new dependency, or task-memory changes are required.

## Agreed behavior

- `/skill:spec <request>` drafts or revises a project spec without requiring a brainstorm. The skill ships a reusable `SPEC-TEMPLATE.md` covering goal and scope, agreed behavior and constraints, material edge cases and deferrals, and acceptance examples. Write project specs as Git-trackable Markdown using the target repo's conventions, or `docs/specs/<slug>.md` when none exist. Keep implementation progress out of the spec.
- A normal brainstorm offers to hand off to the spec skill after brief approval. If the user requested the full flow, proceed directly to spec drafting using the approved brief. Approving the brief alone never authorizes code changes.
- A spec-only request stops at the written spec. If the user also asks to build, present the written spec and a proposed breakdown of small `/task` steps, each with a verifiable outcome. One explicit approval covering both authorizes execution without a second go message. Use `/task` to track the approved breakdown and reference the spec rather than copying it.
- `/task` remains available for substantial work that did not go through brainstorming or specification.

## Edge cases

- If an unrelated `/task` is active, drafting and proposing steps can continue. Do not replace the active task or begin code changes. Ask the user to resume and finish the existing task or abandon it.
- If agreed behavior or acceptance criteria change materially after approval, pause affected work, revise the spec and breakdown, and request approval again. Reconfirm the brief as well if the change invalidates a confirmed brainstorm requirement. Routine implementation choices do not require reapproval.

## Acceptance examples

| Request or state | Expected outcome |
| --- | --- |
| Run `/skill:spec` without a brainstorm | Write or revise a spec at the project path; do not change code or task state. |
| Approve the brief in a normal brainstorm | Offer the spec handoff; do not draft automatically or start implementation. |
| Request the full flow and approve the brainstorm brief | Draft the spec and propose steps; start execution only after explicit approval of both and resolution of any active-task conflict. |
| Ask for substantial work without invoking either skill | The agent can use `/task` directly. |
| Request the full flow while `/task` tracks unrelated work | Preserve the task and pause execution while the user decides whether to finish or abandon it. |
| Discover a material acceptance change during implementation | Pause affected work and get the revised spec and breakdown approved before resuming. |
