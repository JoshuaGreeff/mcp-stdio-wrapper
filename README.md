# MCP Stdio Wrapper

[![CI](https://img.shields.io/github/actions/workflow/status/JoshuaGreeff/mcp-stdio-wrapper/ci.yml?branch=main&label=ci)](https://github.com/JoshuaGreeff/mcp-stdio-wrapper/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/JoshuaGreeff/mcp-stdio-wrapper/codeql.yml?branch=main&label=codeql)](https://github.com/JoshuaGreeff/mcp-stdio-wrapper/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://img.shields.io/github/actions/workflow/status/JoshuaGreeff/mcp-stdio-wrapper/scorecard.yml?branch=main&label=scorecard)](https://github.com/JoshuaGreeff/mcp-stdio-wrapper/actions/workflows/scorecard.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/JoshuaGreeff/mcp-stdio-wrapper/release.yml?label=release)](https://github.com/JoshuaGreeff/mcp-stdio-wrapper/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/JoshuaGreeff/mcp-stdio-wrapper?style=social)](https://github.com/JoshuaGreeff/mcp-stdio-wrapper/stargazers)

`MCP Stdio Wrapper` is a small MCP server that lets one MCP client launch and inspect another stdio MCP server on demand.

Its job is to remove a painful MCP development loop: some mainstream MCP hosts cache the real server process, so after every code change you end up refreshing the window or restarting the extension host just to smoke-test the change. This wrapper sits in front of the real target server and gives your agent a stable bridge for repeated smoke tests while the target implementation keeps changing underneath it.

## Why This Exists

Use this project when:

- you are actively developing a stdio MCP server
- your main MCP host does not reliably reload the target server after each change
- you still want an agent to list tools, call tools, read resources, and inspect prompts throughout development

This project is intentionally narrow. It is for local development and smoke testing, not for production traffic proxying.

The wrapper also exposes built-in guidance that agents can discover directly:

- resource: `wrapper://how-to-use`
- prompt: `tool_usage_guide`

## How It Works

The wrapper exposes six generic bridge tools:

- `stdio_mcp_list_tools`
- `stdio_mcp_call_tool`
- `stdio_mcp_list_resources`
- `stdio_mcp_read_resource`
- `stdio_mcp_list_prompts`
- `stdio_mcp_get_prompt`

Each bridge call:

1. launches the target stdio MCP server
2. performs one MCP operation
3. returns the result
4. closes the target process

That means:

- no persistent target session state
- no hidden caching behavior
- a clean target process per smoke test
- easier debugging because target stderr is surfaced on failure

## Quick Start

Clone the repo and install dependencies:

```bash
nvm use
npm install
```

Start the wrapper:

```bash
npm start
```

Once you publish the package to npm, this can also become:

```bash
npx mcp-stdio-wrapper
```

This repo is set up for npm trusted publishing from GitHub Actions after the initial package publish. See [Publishing checklist](./docs/publishing.md) for the first-publish and OIDC handoff steps.

Point your main MCP client at this wrapper, then use one of the bridge tools with launch input like:

```json
{
  "command": "node",
  "args": ["C:\\path\\to\\your-mcp\\dist\\index.js"],
  "cwd": "C:\\path\\to\\your-mcp",
  "inheritParentEnv": true,
  "env": {
    "EXAMPLE_ENV": "value"
  },
  "timeoutMs": 30000
}
```

Then ask your agent to:

- list tools from the real target server
- call one target tool after each code change
- verify resource reads or prompts

## Tool Surface

Common launch fields:

- `command`: target executable
- `args`: target command arguments
- `cwd`: optional target working directory
- `inheritParentEnv`: when `true`, merge the wrapper process environment into the target launch
- `env`: additional target environment variables
- `timeoutMs`: max time for target launch and operation

Bridge operations:

- `stdio_mcp_list_tools`: inspect target tools
- `stdio_mcp_call_tool`: call one target tool
- `stdio_mcp_list_resources`: inspect target resources
- `stdio_mcp_read_resource`: read one target resource
- `stdio_mcp_list_prompts`: inspect target prompts
- `stdio_mcp_get_prompt`: fetch one target prompt definition

Wrapper guidance surfaces:

- `wrapper://how-to-use`: plain-text usage guide
- `tool_usage_guide`: prompt form of the same instructions

## Safety Notes

- This wrapper launches arbitrary commands supplied by the caller.
- Treat launch arguments and env vars as sensitive.
- Only use it with trusted target commands and trusted local projects.
- Do not expose this as a public multi-tenant service.

## Documentation

- [Setup guide](./docs/setup.md)
- [Tool reference](./docs/reference.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Maintainer guide](./docs/maintainer.md)
- [Publishing checklist](./docs/publishing.md)
- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=JoshuaGreeff/mcp-stdio-wrapper&type=Date)](https://www.star-history.com/#JoshuaGreeff/mcp-stdio-wrapper&Date)
