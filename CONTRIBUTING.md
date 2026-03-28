# Contributing

## Development Loop

1. `npm install`
2. `npm run check`
3. `npm test`

## Branching

- `main` is the protected stable branch
- `dev` is the integration branch for ongoing work
- new work should usually branch from `dev` and merge back into `dev`
- promotion to `main` should happen through a dedicated pull request from `dev`

## Scope

This project is a generic MCP stdio bridge for development smoke testing.

Good contributions:

- clearer bridge ergonomics
- better target-process error reporting
- lightweight generic MCP inspection features
- documentation and test improvements

Out of scope:

- target-specific business logic
- turning the wrapper into a general workflow engine

## Pull Requests

- keep changes small and reviewable
- update docs for any user-facing behavior change
- add or adjust tests when bridge behavior changes
