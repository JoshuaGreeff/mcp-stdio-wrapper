#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "fake-target",
  version: "0.1.0",
});

server.registerTool(
  "echo_tool",
  {
    description: "Echo input text.",
    inputSchema: {
      text: z.string(),
    },
  },
  async ({ text }) => ({
    content: [{ type: "text", text }],
    structuredContent: { echoed: text },
  }),
);

server.registerTool(
  "fail_tool",
  {
    description: "Fail after writing to stderr.",
    inputSchema: {
      reason: z.string(),
    },
  },
  async ({ reason }) => {
    process.stderr.write(`fake-target failure: ${reason}\n`);
    throw new Error(`tool failed: ${reason}`);
  },
);

server.registerResource(
  "fake-resource",
  new ResourceTemplate("fake://resource/{name}", { list: undefined }),
  {
    title: "Fake Resource",
    mimeType: "application/json",
  },
  async (uri, params) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ name: Array.isArray(params.name) ? params.name[0] : params.name }),
      },
    ],
  }),
);

server.registerPrompt(
  "fake_prompt",
  {
    title: "Fake Prompt",
    argsSchema: {
      who: z.string(),
    },
  },
  async ({ who }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Hello ${who}` } }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
