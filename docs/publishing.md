# GitHub And Publishing Checklist

## Recommended Repository

- owner: `JoshuaGreeff`
- repo: `mcp-stdio-wrapper`
- default branch: `main`

## Recommended GitHub Settings

- enable branch protection on `main`
- require the `CI` workflow before merge
- require the `Scorecard` workflow if you want stricter public repo hygiene
- enable GitHub Security Advisories
- enable Dependabot alerts and security updates
- keep issues and discussions enabled if you want public feedback

## Recommended Secrets

- `NPM_TOKEN`
  - only needed if you want the release workflow to publish to npm

## First Publish Steps

1. create the GitHub repository
2. push the project contents
3. confirm Actions are enabled
4. confirm `CI` passes on the first push
5. if you want npm publishing, add `NPM_TOKEN`
6. create a release tag like `v0.1.0`
7. push the tag to trigger the release workflow

## Recommended README / About Metadata

- title: `MCP Stdio Wrapper`
- description: `Development-first MCP wrapper for smoke-testing stdio MCP servers from another MCP client during active development.`
- topics:
  - `mcp`
  - `model-context-protocol`
  - `stdio`
  - `developer-tools`
  - `testing`
  - `smoke-test`

## Before Every Release

1. update docs for any user-facing change
2. update `CHANGELOG.md`
3. run:

```bash
nvm use
npm run check
npm test
npm run pack:check
```

4. bump `package.json` version
5. tag the release

## Nice-To-Have Later

- publish to npm for `npx mcp-stdio-wrapper`
- add a tiny demo video or GIF to the README
- add an integration smoke test against a second real MCP server repo
