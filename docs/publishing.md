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
- if you are the only maintainer, keep the `main` ruleset strict on checks/history but do not require external approvals until more trusted maintainers exist

## Recommended Secrets

- `NPM_TOKEN`
  - optional
  - useful for the first publish if the package does not exist on npm yet
  - once trusted publishing is configured, remove it so the workflow uses OIDC instead

## Trusted Publishing Strategy

npm trusted publishing is the end state, but npm's trust management requires that the package already exists on the registry. That means the practical sequence is:

1. first publish the package once
2. configure npm trusted publishing for the package and GitHub workflow
3. remove `NPM_TOKEN`
4. let future releases publish through OIDC

This repo's publish workflow supports both phases:

- if `NPM_TOKEN` exists, it publishes with the token
- if `NPM_TOKEN` is absent, it attempts trusted publishing with GitHub OIDC

## First Publish Steps

1. create the GitHub repository
2. push the project contents
3. confirm Actions are enabled
4. confirm `CI` passes on the first push
5. create an npm account and enable 2FA on that account
6. add `NPM_TOKEN` as a GitHub Actions secret for the first publish
7. create a release tag like `v0.1.0`
8. push the tag to trigger the publish workflow

## Enabling Trusted Publishing For Later Releases

After the package exists on npm:

1. ensure you can authenticate to npm locally with an account that has write access to `mcp-stdio-wrapper`
2. use npm `11.10.0` or newer
3. run:

```bash
npm trust github mcp-stdio-wrapper --repo JoshuaGreeff/mcp-stdio-wrapper --file release.yml
```

4. verify the trusted publisher configuration exists:

```bash
npm trust list mcp-stdio-wrapper
```

5. remove the `NPM_TOKEN` secret from the GitHub repo
6. push the next release tag and let GitHub Actions publish via OIDC

If you later want to replace the trusted publisher relationship, use:

```bash
npm trust list mcp-stdio-wrapper
npm trust revoke mcp-stdio-wrapper --id <trust-id>
```

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

## Notes

- The trusted publisher configuration is tied to the workflow filename, so if you rename `.github/workflows/release.yml`, update npm trusted publishing too.
- The publish workflow already has `id-token: write`, which npm trusted publishing requires.

## Nice-To-Have Later

- publish to npm for `npx mcp-stdio-wrapper`
- add a tiny demo video or GIF to the README
- add an integration smoke test against a second real MCP server repo
