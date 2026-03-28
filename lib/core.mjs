export const usageGuideText = `MCP Stdio Wrapper usage guide

Purpose:
- Smoke-test another stdio MCP server during active development.
- Avoid refreshing the main MCP host just to relaunch the real target server after code changes.

Recommended sequence:
1. Read wrapper://how-to-use or request the tool_usage_guide prompt.
2. Use stdio_mcp_list_tools against the target server first.
3. Use stdio_mcp_call_tool against one small safe target tool.
4. Repeat the same smoke tests after each code change.

Behavior:
- Every bridge call launches a fresh target process.
- The wrapper does not keep target session state.
- Target stderr is surfaced on failures when available.

Important launch fields:
- command: target executable
- args: target arguments
- cwd: optional target working directory
- inheritParentEnv: merge the wrapper environment into the target launch
- env: extra target environment variables
- timeoutMs: operation timeout in milliseconds

Safety:
- Only launch trusted local target commands.
- Do not expose this wrapper as a public multi-tenant service.`;

export function tailText(value, maxChars = 4000) {
  if (!value) {
    return "";
  }
  return value.length <= maxChars ? value : value.slice(value.length - maxChars);
}

export function buildLaunchEnv(launch, parentEnv = process.env) {
  return launch.inheritParentEnv ? { ...parentEnv, ...launch.env } : launch.env;
}
