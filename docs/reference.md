# Tool Reference

## One-Shot Launch Fields

Every one-shot bridge tool takes the same target launch fields:

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
- `startupTimeoutMs`
  - optional
  - maximum time for target launch plus MCP initialize on one-shot calls
- `operationTimeoutMs`
  - optional
  - maximum time for the one-shot MCP operation after startup succeeds
- `timeoutMs`
  - optional legacy shortcut
  - if provided, applies the same timeout to both one-shot phases

## Bridge Tools

### `stdio_mcp_list_tools`

Launches the target stdio MCP server and returns its declared tools.

### `stdio_mcp_call_tool`

Launches the target server and calls one target tool.

Prefer this for stateless single calls. If the target preserves in-memory state, returns deferred handles like `jobId`, or expects follow-up calls against one live process, open a wrapper session instead.

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

Prefer this when:

- the target returns `jobId`, `sessionId`, `relatedUpid`, or `waitMode: deferred`
- follow-up tools need process-local target state
- target startup is expensive and you plan several sequential MCP operations

Additional fields:

- `timeoutMs`
  - defaults to `30000`
  - maximum time for target launch plus MCP initialize before the session opens
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

## Choosing One-Shot vs Session Mode

Use one-shot mode for:

- initial inspection with `stdio_mcp_list_tools`
- stateless reads
- a single small synchronous tool call

Use session mode for:

- deferred or handle-based workflows
- `job_*` style follow-up tools
- anything that must reuse target in-memory state
- several sequential calls where repeated startup is just noise

Short stateful example:

1. `stdio_mcp_open_session`
2. `stdio_mcp_session_list_tools`
3. `stdio_mcp_session_call_tool` for a target tool that returns a handle
4. `stdio_mcp_session_call_tool` again for the follow-up call that consumes that handle
5. `stdio_mcp_get_session` if you need wrapper-side diagnostics
6. `stdio_mcp_close_session`

## Error Behavior

- If the target process fails to launch or the target MCP operation fails, the wrapper returns an error to the caller.
- If the target writes to stderr, the wrapper appends a tail of that stderr output to thrown launch errors when possible and includes `stderrTail` on error tool results when available.
- One-shot timeouts identify whether the wrapper timed out during target launch and MCP initialize or during the target MCP operation.
- Session open and session-scoped calls still use `timeoutMs` and fail with a timeout error when that phase exceeds its budget.
- Session records remain inspectable after idle timeout, hard timeout, or unexpected target exit until the caller runs `stdio_mcp_close_session`.
- Session-scoped calls fail immediately if the target session is already terminal or already serving another in-flight operation.
