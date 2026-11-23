---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when resolving codebase terminology, writing or editing a GLOSSARY.md or GLOSSARY-MAP.md, or recording or editing an ADR.
---

# Domain Modeling

Build and sharpen the project's domain model as you design. Challenge language, test boundaries with concrete scenarios, and record agreed terms and decisions when they crystallize. Looking up an existing definition alone does not require this skill.

## Find the right context

Use the Git root, or the working directory outside Git. Resolve format links relative to this skill's folder and project files relative to the project root.

- **Single context:** Keep `GLOSSARY.md` and `docs/adr/` at the project root. Use [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).
- **Multiple contexts:** Use root `GLOSSARY-MAP.md` to find each context's glossary and `docs/adr/`. Keep system-wide ADRs in root `docs/adr/`. Use [GLOSSARY-MAP-FORMAT.md](./GLOSSARY-MAP-FORMAT.md). Read the mapped glossary directly.

Do not create a map just because the code has several folders. Use one when the user confirms distinct modeling contexts with their own vocabulary or rules. Do not move or delete an existing root glossary as part of creating a map unless the user approves that change. Create files and directories only when there is agreed content to put in them.

## Model the domain

1. **Challenge conflicts.** If an existing glossary defines cancellation as ending an entire order but the user describes canceling one line, show the discrepancy and ask which meaning applies in this context.
2. **Sharpen vague terms.** Propose a canonical term for overloaded language. For example, ask whether “account” means a customer relationship or a user identity rather than treating them as synonyms.
3. **Test boundaries with scenarios.** Use concrete cases involving relationships, lifecycles, and exceptions. Cross-check claims about current behavior against relevant code or tests. Surface contradictions and distinguish current behavior from the proposed model.
4. **Record terms as they settle.** Once the user approves the exact wording and destination, update the glossary or map immediately; do not batch agreed entries until the end. Keep glossary entries about domain meaning, not implementation details, specifications, or working notes.

## Offer ADRs sparingly

Offer an ADR only when the decision is hard to reverse, surprising without context, **and** the result of a real trade-off. If any of the three is missing, skip it. Use [ADR-FORMAT.md](./ADR-FORMAT.md) and get the user's approval before writing it. Put the ADR in the context that owns the decision, or at the project root if the trade-off affects multiple contexts.
