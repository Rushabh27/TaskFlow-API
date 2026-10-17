# TaskFlow-API
basic management of tasks


## PR 1
## Summary
- Add strict validation for task creation and updates.
- Reject empty updates, invalid statuses, incorrect field types, and unknown fields.
- Ensure invalid updates do not mutate stored tasks.
- Add pagination with default values and a maximum page size.
- Add API tests for validation errors, pagination boundaries, and data integrity.

## Testing
- `npm test`

## Review focus
Please review input validation, update atomicity, pagination boundary behavior, and API response consistency.



