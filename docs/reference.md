# Tool Reference

## Common Launch Fields

Every bridge tool takes the same target launch fields:

- `command`
  - required target executable
- `args`
  - optional target arguments
- `cwd`
  - optional target working directory
- `inheritParentEnv`
  - defaults to `true`
  - when enabled, the wrapper process environment is merged into the target environment
- `env`
  - additional target environment variables
- `timeoutMs`
  - defaults to `30000`
  - maximum time for the target launch plus the MCP operation

## Bridge Tools

### `stdio_mcp_list_tools`

Launches the target stdio MCP server and returns its declared tools.

### `stdio_mcp_call_tool`

Launches the target server and calls one target tool.

Additional fields:

- `name`
  - target tool name
- `arguments`
  - object passed to the target tool

### `stdio_mcp_list_resources`

Launches the target server and returns its declared resources.

### `stdio_mcp_read_resource`

Launches the target server and reads one resource.

Additional fields:

- `uri`
  - target resource URI

### `stdio_mcp_list_prompts`

Launches the target server and returns its declared prompts.

### `stdio_mcp_get_prompt`

Launches the target server and resolves one prompt definition.

Additional fields:

- `name`
  - target prompt name
- `arguments`
  - string-valued prompt arguments

## Session Tools

### `stdio_mcp_open_session`

Launches the target stdio MCP server once and returns a wrapper-managed `sessionId`.

Additional fields:

- `idleTimeoutMs`
  - defaults to `60000`
  - closes the session after this much inactivity
- `hardTimeoutMs`
  - defaults to `300000`
  - closes the session after this total lifetime even if it is still being used

Returns:

- `sessionId`
- `status`
- `pid`
- `startedAt`
- `lastUsedAt`
- `idleTimeoutMs`
- `hardTimeoutMs`

### `stdio_mcp_get_session`

Returns read-only diagnostics for a wrapper-managed session.

Fields returned:

- `sessionId`
- `status`
  - `open`, `busy`, or `closed`
- `pid`
- `startedAt`
- `lastUsedAt`
- `closeReason`
- `exitCode`
- `stderrTail`

### `stdio_mcp_close_session`

Closes a live session if needed, returns the final diagnostic snapshot, and removes the session record from the wrapper.

### `stdio_mcp_session_list_tools`

Lists tools through an existing session.

### `stdio_mcp_session_call_tool`

Calls one target tool through an existing session.

Additional fields:

- `name`
  - target tool name
- `arguments`
  - object passed to the target tool

### `stdio_mcp_session_list_resources`

Lists resources through an existing session.

### `stdio_mcp_session_read_resource`

Reads one resource through an existing session.

Additional fields:

- `uri`
  - target resource URI

### `stdio_mcp_session_list_prompts`

Lists prompts through an existing session.

### `stdio_mcp_session_get_prompt`

Fetches one prompt definition through an existing session.

Additional fields:

- `name`
  - target prompt name
- `arguments`
  - string-valued prompt arguments

## Session Operation Fields

Every `stdio_mcp_session_*` bridge call takes:

- `sessionId`
  - required session identifier returned by `stdio_mcp_open_session`
- `timeoutMs`
  - defaults to `30000`
  - maximum time for that session-scoped MCP operation

## Wrapper Guidance Surfaces

### `wrapper://how-to-use`

Built-in text guidance for operators and agents. This is the best starting point when the caller is not yet sure how to use the wrapper.

### `tool_usage_guide`

Built-in prompt that returns the same usage guidance for hosts that surface prompts more naturally than resources.

## Error Behavior

- If the target process fails to launch or the target MCP operation fails, the wrapper returns an error to the caller.
- If the target writes to stderr, the wrapper appends a tail of that stderr output to thrown launch errors when possible and includes `stderrTail` on error tool results when available.
- If the target call exceeds `timeoutMs`, the wrapper fails the call with a timeout error.
- Session records remain inspectable after idle timeout, hard timeout, or unexpected target exit until the caller runs `stdio_mcp_close_session`.
- Session-scoped calls fail immediately if the target session is already terminal or already serving another in-flight operation.
