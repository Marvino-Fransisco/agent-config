# ADR format

Follow the repository's existing ADR convention if it has one. Otherwise use `docs/adr/0001-<dash-case-title>.md`, incrementing the highest number in the destination directory. Use root `docs/adr/` for system-wide decisions and the context's `docs/adr/` for local decisions.

```markdown
# <Number>. <Decision title>

Date: <YYYY-MM-DD>
Status: Accepted

## Context

<What forced a decision, and why does it matter?>

## Decision

<What was chosen and why?>

## Alternatives considered

<Which realistic options were rejected, and what trade-offs ruled them out?>

## Consequences

<What improves, what gets harder, and what would justify revisiting this decision?>
```
