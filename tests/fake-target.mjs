#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "fake-target",
  version: "0.1.0",
});

let counter = 0;

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
  "pid_tool",
  {
    description: "Return the current process id.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: String(process.pid) }],
    structuredContent: { pid: process.pid },
  }),
);

server.registerTool(
  "counter_tool",
  {
    description: "Return and optionally increment a process-local counter.",
    inputSchema: {
      incrementBy: z.number().int().default(1),
    },
  },
  async ({ incrementBy }) => {
    counter += incrementBy;
    return {
      content: [{ type: "text", text: String(counter) }],
      structuredContent: { counter },
    };
  },
);

server.registerTool(
  "slow_tool",
  {
    description: "Wait for a while before responding.",
    inputSchema: {
      delayMs: z.number().int().min(0),
    },
  },
  async ({ delayMs }) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return {
      content: [{ type: "text", text: `waited ${delayMs}` }],
      structuredContent: { delayMs },
    };
  },
);

server.registerTool(
  "deferred_handle_tool",
  {
    description: "Return a stateful-looking deferred handle.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: "job-123" }],
    structuredContent: {
      jobId: "job-123",
      waitMode: "deferred",
    },
  }),
);

server.registerTool(
  "stderr_tool",
  {
    description: "Write lines to stderr and succeed.",
    inputSchema: {
      lines: z.array(z.string()).default([]),
    },
  },
  async ({ lines }) => {
    for (const line of lines) {
      process.stderr.write(`${line}\n`);
    }
    return {
      content: [{ type: "text", text: String(lines.length) }],
      structuredContent: { linesWritten: lines.length },
    };
  },
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

server.registerTool(
  "exit_tool",
  {
    description: "Exit the target process immediately.",
    inputSchema: {
      code: z.number().int().min(0).max(255).default(17),
    },
  },
  async ({ code }) => {
    process.stderr.write(`fake-target exiting: ${code}\n`);
    process.exit(code);
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
const startupDelayMs = Number.parseInt(process.env.FAKE_TARGET_STARTUP_DELAY_MS ?? "0", 10);
if (Number.isFinite(startupDelayMs) && startupDelayMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, startupDelayMs));
}
await server.connect(transport);
