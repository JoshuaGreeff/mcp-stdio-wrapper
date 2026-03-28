# Maintainer Guide

## Project Shape

The project is intentionally small:

- `index.mjs`
  - the wrapper MCP server
- `tests/fake-target.mjs`
  - tiny stdio target used by tests
- `tests/wrapper.test.mjs`
  - black-box bridge tests
- `docs/`
  - end-user and maintainer docs
- `.github/workflows/`
  - CI, release, and security automation

## Design Constraints

- every bridge tool call launches a fresh target server
- no persistent target session state
- no hidden caching layer
- stderr from the target process is surfaced in wrapper errors
- keep the implementation generic and client-agnostic

This keeps behavior predictable for smoke testing and makes cleanup straightforward.

## Local Validation

```bash
npm run check
npm test
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
  - runs syntax checks and tests on Windows and Linux across supported Node versions
- `Release`
  - validates the repo on tags, builds an npm package tarball, creates a GitHub release, and optionally publishes to npm when `NPM_TOKEN` is configured
- `CodeQL`
  - runs JavaScript security scanning
- `Dependabot`
  - keeps npm packages and GitHub Actions current

## Future Work

Reasonable future additions:

- optional reusable target sessions
- target stderr/stdout resource capture
- target initialize metadata inspection
- optional HTTP wrapper mode in addition to stdio
