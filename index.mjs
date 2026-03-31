#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DEFAULT_HARD_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  buildLaunchEnv,
  tailText,
  usageGuideText,
  withTimeout,
} from "./lib/core.mjs";
import { SessionManager } from "./lib/session-manager.mjs";

const serverInfo = {
  name: "mcp-stdio-wrapper",
  version: "0.1.0",
};

const clientInfo = {
  name: "mcp-stdio-wrapper-client",
  version: "0.1.0",
};

const server = new McpServer(
  serverInfo,
  {
    instructions:
      "Development-focused MCP wrapper for smoke-testing another stdio MCP server. Start with the wrapper usage resource or prompt, then use stdio_mcp_list_tools before stdio_mcp_call_tool. One-shot bridge calls launch a fresh target stdio server for each operation. If the target needs process-local state, returns deferred handles, or has expensive startup, use the bounded session API instead.",
  },
);

const sessionManager = new SessionManager(clientInfo);

const envSchema = z.record(z.string(), z.string()).default({});
const timeoutMsSchema = z.number().int().positive().max(MAX_TIMEOUT_MS);
const sessionTimeoutMsSchema = timeoutMsSchema.default(DEFAULT_OPERATION_TIMEOUT_MS);
const sessionLifetimeSchema = z.number().int().positive().max(3600000);
const sessionIdSchema = z.string().min(1).describe("Session identifier returned by stdio_mcp_open_session.");

const baseLaunchSchema = {
  command: z.string().min(1).describe("Executable to launch for the target stdio MCP server."),
  args: z.array(z.string()).default([]).describe("Command arguments for the target server."),
  cwd: z.string().optional().describe("Optional working directory for the target server."),
  inheritParentEnv: z.boolean().default(true).describe("When true, merge the wrapper process environment into the target launch environment."),
  env: envSchema.describe("Additional environment variables for the target server."),
};

const oneShotLaunchSchema = {
  ...baseLaunchSchema,
  timeoutMs: timeoutMsSchema.optional().describe("Legacy shortcut that applies the same timeout to one-shot target startup and the one-shot MCP operation."),
  startupTimeoutMs: timeoutMsSchema.optional().describe("Maximum time to allow one-shot target launch and MCP initialize before failing."),
  operationTimeoutMs: timeoutMsSchema.optional().describe("Maximum time to allow the one-shot MCP operation after startup before failing."),
};

const sessionLaunchSchema = {
  ...baseLaunchSchema,
  timeoutMs: sessionTimeoutMsSchema.describe("Maximum time to allow target launch and MCP initialize before the wrapper session opens."),
  idleTimeoutMs: sessionLifetimeSchema.default(DEFAULT_IDLE_TIMEOUT_MS).describe("Maximum idle time before the wrapper closes the session."),
  hardTimeoutMs: sessionLifetimeSchema.default(DEFAULT_HARD_TIMEOUT_MS).describe("Maximum total lifetime before the wrapper closes the session."),
};

const sessionOperationSchema = {
  sessionId: sessionIdSchema,
  timeoutMs: sessionTimeoutMsSchema.describe("Maximum time to allow the session-scoped MCP operation before failing."),
};

const statefulHintText =
  "This one-shot result looks stateful. If follow-up calls must reuse this handle or target in-memory state, prefer stdio_mcp_open_session and the stdio_mcp_session_* tools.";

function textResult(title, data, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: `${title}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
    structuredContent: data,
    isError,
  };
}

function isStatefulToolName(name) {
  return /(^|_)(job|session)(_|$)/i.test(name);
}

function hasStatefulSignal(value, visited = new Set()) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value !== "object") {
    return false;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => hasStatefulSignal(item, visited));
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === "jobId" || key === "sessionId" || key === "relatedUpid") {
      return true;
    }
    if (key === "waitMode" && nested === "deferred") {
      return true;
    }
    if (hasStatefulSignal(nested, visited)) {
      return true;
    }
  }

  return false;
}

function buildOneShotToolHints(name, result) {
  if (result.isError) {
    return [];
  }
  if (isStatefulToolName(name) || hasStatefulSignal(result.structuredContent)) {
    return [statefulHintText];
  }
  return [];
}

function resolveOneShotTimeouts(launch) {
  return {
    ...launch,
    startupTimeoutMs: launch.startupTimeoutMs ?? launch.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
    operationTimeoutMs: launch.operationTimeoutMs ?? launch.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
  };
}

function toolResult(name, result, stderrTailText = "", wrapperHints = []) {
  return textResult(
    `Target MCP tool ${name}`,
    {
      content: result.content,
      structuredContent: result.structuredContent ?? null,
      isError: result.isError ?? false,
      stderrTail: (result.isError ? stderrTailText : "") || null,
      wrapperHints: wrapperHints.length > 0 ? wrapperHints : null,
    },
    result.isError ?? false,
  );
}

function buildListToolsHints(listed) {
  const hasStatefulWorkflowSignal = listed.tools.some((tool) => {
    const description = typeof tool.description === "string" ? tool.description : "";
    return isStatefulToolName(tool.name) || /\bdeferred\b|\bstateful\b/i.test(description);
  });
  if (!hasStatefulWorkflowSignal) {
    return null;
  }
  return [
    "This target exposes likely stateful workflow tools. If follow-up calls must reuse handles or in-memory target state, prefer stdio_mcp_open_session and the stdio_mcp_session_* tools.",
  ];
}

function listToolsResult(listed) {
  return textResult("Target MCP tools", {
    tools: listed.tools,
    wrapperHints: buildListToolsHints(listed),
  });
}

function listResourcesResult(listed) {
  return textResult("Target MCP resources", listed);
}

function readResourceResult(uri, result) {
  return textResult(`Target MCP resource ${uri}`, result);
}

function listPromptsResult(listed) {
  return textResult("Target MCP prompts", listed);
}

function getPromptResult(name, result) {
  return textResult(`Target MCP prompt ${name}`, result);
}

async function withClient(launch, work) {
  const normalizedLaunch = resolveOneShotTimeouts(launch);
  const transport = new StdioClientTransport({
    command: normalizedLaunch.command,
    args: normalizedLaunch.args,
    cwd: normalizedLaunch.cwd,
    env: buildLaunchEnv(normalizedLaunch),
    stderr: "pipe",
  });

  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr = tailText(`${stderr}${chunk.toString()}`);
  });

  const client = new Client(clientInfo, { capabilities: {} });

  try {
    await withTimeout(
      client.connect(transport),
      normalizedLaunch.startupTimeoutMs,
      "Target launch and MCP initialize",
    );
    return await withTimeout(
      work(client, {
        stderrTail() {
          return stderr;
        },
      }),
      normalizedLaunch.operationTimeoutMs,
      "Target MCP operation",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(stderr ? `${message}\n\nTarget stderr tail:\n${stderr}` : message);
  } finally {
    await client.close().catch(() => {});
  }
}

server.registerResource(
  "how-to-use",
  "wrapper://how-to-use",
  {
    title: "Wrapper Usage Guide",
    description: "How to use MCP Stdio Wrapper effectively during development.",
    mimeType: "text/plain",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: usageGuideText,
      },
    ],
  }),
);

server.registerPrompt(
  "tool_usage_guide",
  {
    title: "Wrapper Usage Guide",
    description: "Operational guidance for using MCP Stdio Wrapper to smoke-test another stdio MCP server.",
  },
  async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: usageGuideText,
        },
      },
    ],
  }),
);

server.registerTool(
  "stdio_mcp_list_tools",
  {
    description: "Launch a target stdio MCP server and list its tools. Best for first-pass inspection; if the target has expensive startup or stateful follow-up work, open a wrapper session instead.",
    inputSchema: oneShotLaunchSchema,
  },
  async (launch) =>
    withClient(launch, async (client) => {
      const listed = await client.listTools();
      return listToolsResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_call_tool",
  {
    description: "Launch a target stdio MCP server and call one of its tools. Best for stateless single calls; if the target preserves in-memory state or returns deferred handles, prefer stdio_mcp_open_session and stdio_mcp_session_call_tool.",
    inputSchema: {
      ...oneShotLaunchSchema,
      name: z.string().min(1).describe("Target tool name."),
      arguments: z.record(z.string(), z.unknown()).default({}).describe("Arguments to pass to the target tool."),
    },
  },
  async ({ name, arguments: toolArguments, ...launch }) =>
    withClient(launch, async (client, context) => {
      const result = await client.callTool({
        name,
        arguments: toolArguments,
      });
      return toolResult(name, result, context.stderrTail(), buildOneShotToolHints(name, result));
    }),
);

server.registerTool(
  "stdio_mcp_list_resources",
  {
    description: "Launch a target stdio MCP server and list its resources. Prefer a wrapper session if several stateful follow-up operations must hit the same target process.",
    inputSchema: oneShotLaunchSchema,
  },
  async (launch) =>
    withClient(launch, async (client) => {
      const listed = await client.listResources();
      return listResourcesResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_read_resource",
  {
    description: "Launch a target stdio MCP server and read one resource URI. Use a wrapper session instead when related calls must share one live target process.",
    inputSchema: {
      ...oneShotLaunchSchema,
      uri: z.string().min(1).describe("Resource URI to read."),
    },
  },
  async ({ uri, ...launch }) =>
    withClient(launch, async (client) => {
      const result = await client.readResource({ uri });
      return readResourceResult(uri, result);
    }),
);

server.registerTool(
  "stdio_mcp_list_prompts",
  {
    description: "Launch a target stdio MCP server and list its prompts. Use a wrapper session when prompt reads are part of a larger stateful target workflow.",
    inputSchema: oneShotLaunchSchema,
  },
  async (launch) =>
    withClient(launch, async (client) => {
      const listed = await client.listPrompts();
      return listPromptsResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_get_prompt",
  {
    description: "Launch a target stdio MCP server and fetch one prompt definition. Prefer a wrapper session when follow-up work must reuse the same target process.",
    inputSchema: {
      ...oneShotLaunchSchema,
      name: z.string().min(1).describe("Prompt name."),
      arguments: z.record(z.string(), z.string()).default({}).describe("Prompt arguments."),
    },
  },
  async ({ name, arguments: promptArguments, ...launch }) =>
    withClient(launch, async (client) => {
      const result = await client.getPrompt({
        name,
        arguments: promptArguments,
      });
      return getPromptResult(name, result);
    }),
);

server.registerTool(
  "stdio_mcp_open_session",
  {
    description: "Launch a target stdio MCP server and keep it alive for multiple MCP operations. Use this when follow-up calls need the same target process, deferred handles, or expensive startup reuse.",
    inputSchema: sessionLaunchSchema,
  },
  async (launch) => textResult("Wrapper session opened", await sessionManager.openSession(launch)),
);

server.registerTool(
  "stdio_mcp_get_session",
  {
    description: "Inspect wrapper-managed diagnostics for a target session.",
    inputSchema: {
      sessionId: sessionIdSchema,
    },
  },
  async ({ sessionId }) => textResult("Wrapper session", sessionManager.getSessionSnapshot(sessionId)),
);

server.registerTool(
  "stdio_mcp_close_session",
  {
    description: "Close a wrapper-managed target session and remove its diagnostics record.",
    inputSchema: {
      sessionId: sessionIdSchema,
    },
  },
  async ({ sessionId }) => textResult("Wrapper session closed", await sessionManager.closeSession(sessionId)),
);

server.registerTool(
  "stdio_mcp_session_list_tools",
  {
    description: "List tools from a previously opened target session.",
    inputSchema: sessionOperationSchema,
  },
  async ({ sessionId, timeoutMs }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client) => {
      const listed = await client.listTools();
      return listToolsResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_session_call_tool",
  {
    description: "Call a target MCP tool through a previously opened session.",
    inputSchema: {
      ...sessionOperationSchema,
      name: z.string().min(1).describe("Target tool name."),
      arguments: z.record(z.string(), z.unknown()).default({}).describe("Arguments to pass to the target tool."),
    },
  },
  async ({ sessionId, timeoutMs, name, arguments: toolArguments }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client, context) => {
      const result = await client.callTool({
        name,
        arguments: toolArguments,
      });
      return toolResult(name, result, context.stderrTail());
    }),
);

server.registerTool(
  "stdio_mcp_session_list_resources",
  {
    description: "List resources from a previously opened target session.",
    inputSchema: sessionOperationSchema,
  },
  async ({ sessionId, timeoutMs }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client) => {
      const listed = await client.listResources();
      return listResourcesResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_session_read_resource",
  {
    description: "Read a resource from a previously opened target session.",
    inputSchema: {
      ...sessionOperationSchema,
      uri: z.string().min(1).describe("Resource URI to read."),
    },
  },
  async ({ sessionId, timeoutMs, uri }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client) => {
      const result = await client.readResource({ uri });
      return readResourceResult(uri, result);
    }),
);

server.registerTool(
  "stdio_mcp_session_list_prompts",
  {
    description: "List prompts from a previously opened target session.",
    inputSchema: sessionOperationSchema,
  },
  async ({ sessionId, timeoutMs }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client) => {
      const listed = await client.listPrompts();
      return listPromptsResult(listed);
    }),
);

server.registerTool(
  "stdio_mcp_session_get_prompt",
  {
    description: "Fetch a prompt definition from a previously opened target session.",
    inputSchema: {
      ...sessionOperationSchema,
      name: z.string().min(1).describe("Prompt name."),
      arguments: z.record(z.string(), z.string()).default({}).describe("Prompt arguments."),
    },
  },
  async ({ sessionId, timeoutMs, name, arguments: promptArguments }) =>
    sessionManager.runSessionOperation(sessionId, timeoutMs, async (client) => {
      const result = await client.getPrompt({
        name,
        arguments: promptArguments,
      });
      return getPromptResult(name, result);
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
