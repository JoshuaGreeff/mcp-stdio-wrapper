import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const wrapperRoot = path.resolve(import.meta.dirname, "..");
const wrapperEntrypoint = path.join(wrapperRoot, "index.mjs");
const fakeTargetEntrypoint = path.join(wrapperRoot, "tests", "fake-target.mjs");

async function withWrapper(work) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [wrapperEntrypoint],
    cwd: wrapperRoot,
    stderr: "pipe",
  });

  const client = new Client({ name: "wrapper-test-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

function launchInput() {
  return {
    command: process.execPath,
    args: [fakeTargetEntrypoint],
    cwd: wrapperRoot,
    env: {},
  };
}

test("lists tools from a target stdio MCP server", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_list_tools",
      arguments: launchInput(),
    });

    assert.equal(result.isError, false);
    const names = result.structuredContent.tools.map((tool) => tool.name);
    assert.ok(names.includes("echo_tool"));
  });
});

test("exposes a wrapper usage resource", async () => {
  await withWrapper(async (client) => {
    const listed = await client.listResources();
    const uris = listed.resources.map((resource) => resource.uri);
    assert.ok(uris.includes("wrapper://how-to-use"));

    const result = await client.readResource({ uri: "wrapper://how-to-use" });
    assert.match(JSON.stringify(result), /stdio_mcp_list_tools/);
  });
});

test("exposes a wrapper usage prompt", async () => {
  await withWrapper(async (client) => {
    const listed = await client.listPrompts();
    const names = listed.prompts.map((prompt) => prompt.name);
    assert.ok(names.includes("tool_usage_guide"));

    const result = await client.getPrompt({ name: "tool_usage_guide", arguments: {} });
    assert.match(JSON.stringify(result), /Smoke-test another stdio MCP server/);
  });
});

test("calls a target MCP tool", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_call_tool",
      arguments: {
        ...launchInput(),
        name: "echo_tool",
        arguments: { text: "wrapper-ok" },
      },
    });

    assert.equal(result.structuredContent.isError, false);
    assert.equal(result.structuredContent.structuredContent.echoed, "wrapper-ok");
  });
});

test("reads a target resource", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_read_resource",
      arguments: {
        ...launchInput(),
        uri: "fake://resource/demo",
      },
    });

    assert.equal(result.isError, false);
    assert.match(JSON.stringify(result.structuredContent), /demo/);
  });
});

test("lists prompts from a target stdio MCP server", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_list_prompts",
      arguments: launchInput(),
    });

    assert.equal(result.isError, false);
    const names = result.structuredContent.prompts.map((prompt) => prompt.name);
    assert.ok(names.includes("fake_prompt"));
  });
});

test("gets a target prompt", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_get_prompt",
      arguments: {
        ...launchInput(),
        name: "fake_prompt",
        arguments: { who: "world" },
      },
    });

    assert.equal(result.isError, false);
    assert.match(JSON.stringify(result.structuredContent), /Hello world/);
  });
});

test("includes target stderr details when the target tool fails", async () => {
  await withWrapper(async (client) => {
    const result = await client.callTool({
      name: "stdio_mcp_call_tool",
      arguments: {
        ...launchInput(),
        name: "fail_tool",
        arguments: { reason: "boom" },
      },
    });

    assert.equal(result.isError, true);
    assert.match(result.structuredContent.stderrTail, /fake-target failure: boom/);
  });
});
