# Setup Guide

## Purpose

Use `MCP Stdio Wrapper` when your normal MCP host keeps an older target stdio server process alive and makes your development feedback loop slow or unreliable.

Instead of pointing your agent directly at the target server you are editing, point it at this wrapper. The wrapper launches the real target server on demand for each smoke-test call and can optionally keep one short-lived target session open across several calls when you need stateful validation.

## Prerequisites

- Node.js `20` or newer
- a local stdio MCP server you want to smoke-test
- an MCP host that can launch another stdio MCP server from a `command` plus `args` configuration

## Install

Clone the repository and install dependencies:

```bash
npm install
```

## Start The Wrapper

```bash
npm start
```

## Add It To Your MCP Host

The exact config shape depends on your MCP host. You want the host to launch:

- command: `node`
- args: `["/absolute/path/to/mcp-stdio-wrapper/index.mjs"]`

Example generic config:

```json
{
  "name": "mcp-stdio-wrapper",
  "command": "node",
  "args": ["C:\\path\\to\\mcp-stdio-wrapper\\index.mjs"]
}
```

If your MCP host uses TOML or another config format, keep the same command and args values and adapt the syntax to that host.

## Call A Target Server Through The Wrapper

Use one of the wrapper bridge tools with launch input like:

```json
{
  "command": "node",
  "args": ["C:\\path\\to\\your-target-mcp\\dist\\index.js"],
  "cwd": "C:\\path\\to\\your-target-mcp",
  "inheritParentEnv": true,
  "env": {
    "YOUR_ENV": "value"
  },
  "timeoutMs": 30000
}
```

Recommended first smoke tests:

1. `stdio_mcp_list_tools`
2. `stdio_mcp_call_tool` against one small safe target tool
3. `stdio_mcp_list_resources` or `stdio_mcp_list_prompts` if your target exposes them

If the agent needs orientation first, have it read `wrapper://how-to-use` or resolve the `tool_usage_guide` prompt before it starts calling bridge tools.

## Optional Session Workflow

Use the session tools when a single target process must serve multiple MCP operations:

1. `stdio_mcp_open_session`
2. `stdio_mcp_session_list_tools`
3. one or more `stdio_mcp_session_call_tool`, `stdio_mcp_session_read_resource`, or `stdio_mcp_session_get_prompt` calls
4. `stdio_mcp_get_session` if you need wrapper-side diagnostics
5. `stdio_mcp_close_session`

Sessions are still meant for short-lived smoke tests. The wrapper enforces idle and hard timeouts so abandoned target processes do not linger.

## Suggested Development Loop

1. keep your editor MCP host connected to `mcp-stdio-wrapper`
2. rebuild or restart your real target MCP server implementation as needed
3. ask your agent to run one or two wrapper bridge calls after each change
4. inspect failures without refreshing the whole editor host

## When To Use It

- smoke-testing a local stdio MCP server during development
- checking that a rebuilt target server actually launches cleanly
- validating tool, resource, and prompt behavior from another MCP client

## When Not To Use It

- long-lived session orchestration that outgrows smoke testing
- production routing between remote clients and remote MCP servers
- latency-sensitive or high-throughput traffic proxying
