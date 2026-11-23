# Change title

Brief: link or one line pointing to the approved brainstorm brief or request. Do not restate it.

## Behavior and acceptance

Agreed rules, constraints, edge cases and deferrals not already covered by the brief. Add concrete Given/When/Then examples or link to existing ones.

## Data and domain

Entity, field, enum, index, and migration changes, with the file each lives in. Note backfill or compatibility needs. Omit if none.

## API contract

Endpoint, method, auth, request and response shape, error cases, and pagination or validation rules. Mark new versus changed. Omit if none.

## Backend changes

| File | Action | What changes |
| --- | --- | --- |
| `path/to/File.cs` | create or modify | Class, method, or handler and the logic added |

## Frontend changes

| File | Action | What changes |
| --- | --- | --- |
| `path/to/file.tsx` | create or modify | Component, hook, route, state, or API client change |

## Tests

Test files to add or update and the cases each covers.

## Order and risks

Build order across repos, rollout or migration risk, and open technical questions.
