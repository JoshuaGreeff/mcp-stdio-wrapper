#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildLaunchEnv, tailText, usageGuideText } from "./lib/core.mjs";

const server = new McpServer(
  {
    name: "mcp-stdio-wrapper",
    version: "0.1.0",
  },
  {
    instructions:
      "Development-focused MCP wrapper for smoke-testing another stdio MCP server. Start with the wrapper usage resource or prompt, then use stdio_mcp_list_tools before stdio_mcp_call_tool. Each bridge call launches a fresh target stdio server, performs one MCP operation, and then closes it.",
  },
);

const envSchema = z.record(z.string(), z.string()).default({});

const launchSchema = {
  command: z.string().min(1).describe("Executable to launch for the target stdio MCP server."),
  args: z.array(z.string()).default([]).describe("Command arguments for the target server."),
  cwd: z.string().optional().describe("Optional working directory for the target server."),
  inheritParentEnv: z.boolean().default(true).describe("When true, merge the wrapper process environment into the target launch environment."),
  env: envSchema.describe("Additional environment variables for the target server."),
  timeoutMs: z.number().int().positive().max(300000).default(30000).describe("Maximum time to allow the target launch and MCP operation before failing."),
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

async function withTimeout(promise, timeoutMs) {
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
    stderr += chunk.toString();
  });

  const client = new Client({ name: "mcp-stdio-wrapper-client", version: "0.1.0" }, { capabilities: {} });

  try {
    return await withTimeout((async () => {
      await client.connect(transport);
      return work(client, {
        stderrTail() {
          return tailText(stderr);
        },
      });
    })(), launch.timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(stderr ? `${message}\n\nTarget stderr tail:\n${tailText(stderr)}` : message);
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
      return textResult("Target MCP tools", { tools: listed.tools });
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

      const stderrTail = result.isError ? context.stderrTail() : "";
      return textResult(`Target MCP tool ${name}`, {
        content: result.content,
        structuredContent: result.structuredContent ?? null,
        isError: result.isError ?? false,
        stderrTail: stderrTail || null,
      }, result.isError ?? false);
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
      return textResult("Target MCP resources", listed);
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
      return textResult(`Target MCP resource ${uri}`, result);
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
      return textResult("Target MCP prompts", listed);
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
      return textResult(`Target MCP prompt ${name}`, result);
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
