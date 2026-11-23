# Glossary map format

Save `GLOSSARY-MAP.md` at the project root when the project has distinct domain contexts. Give each context a name, a short statement of its responsibility, and a repository-relative link to its glossary. Include its ADR directory only when it exists. Keep domain definitions in the linked glossaries, not in the map.

```markdown
# Glossary map

| Context | Responsibility | Glossary | Context ADRs |
| --- | --- | --- | --- |
| Ordering | Accepts and tracks purchase commitments. | [Ordering glossary](src/ordering/GLOSSARY.md) | [Ordering ADRs](src/ordering/docs/adr/) |
| Billing | Issues invoices and tracks payment. | [Billing glossary](src/billing/GLOSSARY.md) | — |
```

If an interaction between contexts needs clarification, add a short `## Context relationships` section. Describe what one context gives to or expects from the other in domain language. Do not create placeholder files or directories just to fill the table.
