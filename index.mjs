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
      "Development-focused MCP wrapper for smoke-testing another stdio MCP server. Start with the wrapper usage resource or prompt, then use stdio_mcp_list_tools before stdio_mcp_call_tool. One-shot bridge calls launch a fresh target stdio server for each operation, and the optional session API keeps a bounded target process alive across several operations.",
  },
);

const sessionManager = new SessionManager(clientInfo);

const envSchema = z.record(z.string(), z.string()).default({});
const timeoutMsSchema = z.number().int().positive().max(300000).default(DEFAULT_OPERATION_TIMEOUT_MS);
const sessionLifetimeSchema = z.number().int().positive().max(3600000);
const sessionIdSchema = z.string().min(1).describe("Session identifier returned by stdio_mcp_open_session.");

const launchSchema = {
  command: z.string().min(1).describe("Executable to launch for the target stdio MCP server."),
  args: z.array(z.string()).default([]).describe("Command arguments for the target server."),
  cwd: z.string().optional().describe("Optional working directory for the target server."),
  inheritParentEnv: z.boolean().default(true).describe("When true, merge the wrapper process environment into the target launch environment."),
  env: envSchema.describe("Additional environment variables for the target server."),
  timeoutMs: timeoutMsSchema.describe("Maximum time to allow the target launch and MCP operation before failing."),
};

const sessionLaunchSchema = {
  ...launchSchema,
  idleTimeoutMs: sessionLifetimeSchema.default(DEFAULT_IDLE_TIMEOUT_MS).describe("Maximum idle time before the wrapper closes the session."),
  hardTimeoutMs: sessionLifetimeSchema.default(DEFAULT_HARD_TIMEOUT_MS).describe("Maximum total lifetime before the wrapper closes the session."),
};

const sessionOperationSchema = {
  sessionId: sessionIdSchema,
  timeoutMs: timeoutMsSchema.describe("Maximum time to allow the session-scoped MCP operation before failing."),
};

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

function toolResult(name, result, stderrTailText = "") {
  return textResult(
    `Target MCP tool ${name}`,
    {
      content: result.content,
      structuredContent: result.structuredContent ?? null,
      isError: result.isError ?? false,
      stderrTail: (result.isError ? stderrTailText : "") || null,
    },
    result.isError ?? false,
  );
}

function listToolsResult(listed) {
  return textResult("Target MCP tools", { tools: listed.tools });
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
  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
    env: buildLaunchEnv(launch),
    stderr: "pipe",
  });

  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr = tailText(`${stderr}${chunk.toString()}`);
  });

  const client = new Client(clientInfo, { capabilities: {} });

  try {
    return await withTimeout(
      (async () => {
        await client.connect(transport);
        return work(client, {
          stderrTail() {
            return stderr;
          },
        });
      })(),
      launch.timeoutMs,
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
    description: "Launch a target stdio MCP server and list its tools.",
    inputSchema: launchSchema,
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
    description: "Launch a target stdio MCP server and call one of its tools.",
    inputSchema: {
      ...launchSchema,
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
      return toolResult(name, result, context.stderrTail());
    }),
);

server.registerTool(
  "stdio_mcp_list_resources",
  {
    description: "Launch a target stdio MCP server and list its resources.",
    inputSchema: launchSchema,
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
    description: "Launch a target stdio MCP server and read one resource URI.",
    inputSchema: {
      ...launchSchema,
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
    description: "Launch a target stdio MCP server and list its prompts.",
    inputSchema: launchSchema,
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
    description: "Launch a target stdio MCP server and fetch one prompt definition.",
    inputSchema: {
      ...launchSchema,
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
    description: "Launch a target stdio MCP server and keep it alive for multiple MCP operations.",
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
