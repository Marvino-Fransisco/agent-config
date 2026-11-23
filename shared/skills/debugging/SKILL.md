---
name: debugging
description: Use this when user or you need to debug
---

## Hypothesis-Driven Debugging

Debug systematically using explicit hypotheses.

1. Form one concrete hypothesis about the root cause.
2. Make the smallest change necessary to test that hypothesis.
3. Verify whether the hypothesis explains the bug.
4. If the hypothesis is wrong:
   - Revert the changes made for that hypothesis.
   - Do not leave speculative changes in the codebase.
   - Form the next hypothesis.
5. Repeat until the root cause is confirmed and the bug is fixed.
6. After confirming the root cause, implement the proper fix if the diagnostic change was only temporary.

Never stack multiple speculative changes together before verification.

## Workflow

1. Re run the program, make sure the program is on the latest state (not a bug because of stale code).
1. Inspect the error, stack trace, and relevant request/context.
2. Locate the exact failing code path.
3. Determine bug layer (database, backend, API, frontend, etc).
4. Form a hypothesis about the root cause and fix it.
5. Verify the fix.

## Good Example

Bug: API returns `500` when submitting a form.

1. Inspect the stack trace and request payload.
2. Trace the request to the failing backend code.
3. Observe that the backend accesses a nullable value.
4. Form hypothesis: the `500` is caused by an unexpected `null` value.
5. Make the smallest diagnostic change needed to verify the hypothesis.
6. Reproduce the request.
7. Confirm that the hypothesis explains the failure.
8. Revert the diagnostic change.
9. Implement the proper fix.
10. Reproduce the request again and verify the bug is fixed.

## Bad Example

Bug: API returns `500` when submitting a form.

1. Guess that the database query is wrong.
2. Modify the query.
3. Guess that the DTO is wrong.
4. Modify the DTO.
5. Guess that validation is wrong.
6. Modify validation.
7. Run the application and observe that the error disappeared.
8. Leave all changes in place.
