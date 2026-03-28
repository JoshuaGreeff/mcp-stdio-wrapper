export const DEFAULT_OPERATION_TIMEOUT_MS = 30000;
export const DEFAULT_IDLE_TIMEOUT_MS = 60000;
export const DEFAULT_HARD_TIMEOUT_MS = 300000;
export const STDERR_TAIL_MAX_CHARS = 4000;

export const usageGuideText = `MCP Stdio Wrapper usage guide

Purpose:
- Smoke-test another stdio MCP server during active development.
- Avoid refreshing the main MCP host just to relaunch the real target server after code changes.

Recommended one-shot sequence:
1. Read wrapper://how-to-use or request the tool_usage_guide prompt.
2. Use stdio_mcp_list_tools against the target server first.
3. Use stdio_mcp_call_tool against one small safe target tool.
4. Repeat the same smoke tests after each code change.

Optional session sequence:
1. Open a session with stdio_mcp_open_session.
2. Inspect tools with stdio_mcp_session_list_tools.
3. Run several stdio_mcp_session_call_tool, stdio_mcp_session_read_resource, or stdio_mcp_session_get_prompt calls against the same target process.
4. Inspect diagnostics with stdio_mcp_get_session if needed.
5. Close the session with stdio_mcp_close_session.

Behavior:
- One-shot bridge calls launch a fresh target process.
- The wrapper only keeps target session state when you explicitly open a session.
- Target stderr is surfaced on failures when available.
- Session mode is explicit, short-lived, and bounded by idle and hard timeouts.

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

export function tailText(value, maxChars = STDERR_TAIL_MAX_CHARS) {
  if (!value) {
    return "";
  }
  return value.length <= maxChars ? value : value.slice(value.length - maxChars);
}

export function buildLaunchEnv(launch, parentEnv = process.env) {
  return launch.inheritParentEnv ? { ...parentEnv, ...launch.env } : launch.env;
}

export async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Target operation timed out after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
