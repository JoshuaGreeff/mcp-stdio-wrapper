# Maintainer Guide

## Project Shape

The project is intentionally small:

- `index.mjs`
  - the wrapper MCP server
- `tests/fake-target.mjs`
  - tiny stdio target used by tests
- `tests/wrapper.test.mjs`
  - black-box bridge tests
- `tests/fuzz.test.js`
  - property-based fuzz tests for core launch helpers
- `docs/`
  - end-user and maintainer docs
- `.github/workflows/`
  - CI, release, and security automation

## Design Constraints

- one-shot bridge tool calls launch a fresh target server
- persistent target state is only available through explicit bounded sessions
- no hidden caching layer
- stderr from the target process is surfaced in wrapper errors
- keep the implementation generic and client-agnostic

This keeps behavior predictable for smoke testing and makes cleanup straightforward.

## Branch Flow

- `main` is the protected release branch
- `dev` is the integration branch for active development
- feature branches should normally branch from `dev`
- promotion to `main` should happen through a PR from `dev`
- while the project has a single active maintainer, `main` may use an owner bypass and does not require external approvals
- when at least one additional trusted maintainer is active, re-enable required approvals, code-owner review, and last-push approval on `main`

See [branching.md](./branching.md) for the repo-level workflow.

## Local Validation

```bash
nvm use
npm install
npm run check
npm test
npm run pack:check
```

## Release Process

1. update docs for any user-facing behavior change
2. update [CHANGELOG.md](../CHANGELOG.md)
3. review [publishing.md](./publishing.md) if repo or release settings changed
4. run:

```bash
npm run check
npm test
```

5. bump the version in `package.json`
6. create a git tag like `v0.1.1`
7. push the tag to trigger the release workflow

## Release Expectations

- keep Node support at `>=20`
- avoid adding build tooling unless the code outgrows plain ESM
- keep the bridge generic; do not turn it into a Proxmox-specific wrapper
- document any new bridge operation in the README and setup guide
- keep tests black-box where possible
- prefer portability across Windows and Linux because local MCP development commonly happens on both

## GitHub Automation

- `CI`
  - runs syntax checks, tests, and package verification on Windows and Linux across supported Node versions
- `Release`
  - validates the repo on tags and publishes the npm package, using token auth for first publish and OIDC trusted publishing afterward
- `CodeQL`
  - runs JavaScript security scanning
- `Scorecard`
  - runs OpenSSF Scorecard checks for public repository hygiene and supply-chain signals
- `Fuzz`
  - runs scheduled property-based fuzz tests against core helper behavior
- `Dependabot`
  - keeps npm packages and GitHub Actions current

## Known Scorecard Backlog

- keep the remaining open Scorecard findings visible until they are actually resolved
- track follow-up in GitHub issue `#7` rather than dismissing the alerts:
  `Track remaining Scorecard backlog after repository hardening`
- expect some findings to remain external or time-based even after the in-repo fixes land:
  `Maintained`, `Contributors`, `CII-Best-Practices`, and any unsigned historical releases

## Repository Governance

- keep `main` on a repository ruleset rather than ad-hoc branch settings
- keep force-push and deletion blocked on `main`
- require PRs, passing checks, review-thread resolution, and linear history on `main`
- keep the live required checks list aligned with the ruleset:
  - `analysis`
  - `analyze (javascript-typescript)`
  - `fuzz`
  - `test (ubuntu-latest, 20)`
  - `test (ubuntu-latest, 22)`
  - `test (windows-latest, 20)`
  - `test (windows-latest, 22)`
- keep the owner bypass narrow and temporary while there are no volunteer approvers

## Future Work

Reasonable future additions:

- target stderr/stdout resource capture
- target initialize metadata inspection
- optional HTTP wrapper mode in addition to stdio
