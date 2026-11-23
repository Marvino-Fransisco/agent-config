# Glossary format

Use one `##` heading per canonical term followed by a short domain definition. `Aliases:` and `Boundary:` are optional. Separate aliases with commas. A similar concept with a different meaning is not an alias. Keep implementation and architecture decisions out of the glossary.

```markdown
# Ordering glossary

## Purchase Order
Aliases: PO, order request

A buyer's formal request to purchase goods or services.

Boundary: A purchase order records the buyer's intent to purchase; an invoice requests payment.
```
