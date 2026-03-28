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

function toolText(result) {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

async function callWrapperTool(client, name, arguments_) {
  return client.callTool({
    name,
    arguments: arguments_,
  });
}

async function openSession(client, overrides = {}) {
  const result = await callWrapperTool(client, "stdio_mcp_open_session", {
    ...launchInput(),
    ...overrides,
  });

  assert.equal(result.isError, false);
  return result.structuredContent;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

test("lists tools from a target stdio MCP server", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_list_tools", launchInput());

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
    assert.match(JSON.stringify(result), /stdio_mcp_open_session/);
  });
});

test("exposes a wrapper usage prompt", async () => {
  await withWrapper(async (client) => {
    const listed = await client.listPrompts();
    const names = listed.prompts.map((prompt) => prompt.name);
    assert.ok(names.includes("tool_usage_guide"));

    const result = await client.getPrompt({ name: "tool_usage_guide", arguments: {} });
    assert.match(JSON.stringify(result), /Smoke-test another stdio MCP server/);
    assert.match(JSON.stringify(result), /stdio_mcp_session_call_tool/);
  });
});

test("calls a target MCP tool", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_call_tool", {
      ...launchInput(),
      name: "echo_tool",
      arguments: { text: "wrapper-ok" },
    });

    assert.equal(result.structuredContent.isError, false);
    assert.equal(result.structuredContent.structuredContent.echoed, "wrapper-ok");
  });
});

test("reads a target resource", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_read_resource", {
      ...launchInput(),
      uri: "fake://resource/demo",
    });

    assert.equal(result.isError, false);
    assert.match(JSON.stringify(result.structuredContent), /demo/);
  });
});

test("lists prompts from a target stdio MCP server", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_list_prompts", launchInput());

    assert.equal(result.isError, false);
    const names = result.structuredContent.prompts.map((prompt) => prompt.name);
    assert.ok(names.includes("fake_prompt"));
  });
});

test("gets a target prompt", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_get_prompt", {
      ...launchInput(),
      name: "fake_prompt",
      arguments: { who: "world" },
    });

    assert.equal(result.isError, false);
    assert.match(JSON.stringify(result.structuredContent), /Hello world/);
  });
});

test("includes target stderr details when the target tool fails", async () => {
  await withWrapper(async (client) => {
    const result = await callWrapperTool(client, "stdio_mcp_call_tool", {
      ...launchInput(),
      name: "fail_tool",
      arguments: { reason: "boom" },
    });

    assert.equal(result.isError, true);
    assert.match(result.structuredContent.stderrTail, /fake-target failure: boom/);
  });
});

test("opens a session and reuses the same target process across tool calls", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);
    assert.equal(session.status, "open");
    assert.equal(session.idleTimeoutMs, 60000);
    assert.equal(session.hardTimeoutMs, 300000);
    assert.equal(typeof session.pid, "number");

    const first = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "pid_tool",
      arguments: {},
    });
    const second = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "pid_tool",
      arguments: {},
    });

    assert.equal(first.isError, false);
    assert.equal(second.isError, false);
    assert.equal(first.structuredContent.structuredContent.pid, session.pid);
    assert.equal(second.structuredContent.structuredContent.pid, session.pid);

    const closed = await callWrapperTool(client, "stdio_mcp_close_session", {
      sessionId: session.sessionId,
    });
    assert.equal(closed.isError, false);
  });
});

test("preserves state across sequential session-scoped tool calls", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);

    const first = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "counter_tool",
      arguments: { incrementBy: 1 },
    });
    const second = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "counter_tool",
      arguments: { incrementBy: 2 },
    });

    assert.equal(first.isError, false);
    assert.equal(second.isError, false);
    assert.equal(first.structuredContent.structuredContent.counter, 1);
    assert.equal(second.structuredContent.structuredContent.counter, 3);
  });
});

test("session-scoped bridge operations match one-shot result shapes", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);

    const oneShotTools = await callWrapperTool(client, "stdio_mcp_list_tools", launchInput());
    const sessionTools = await callWrapperTool(client, "stdio_mcp_session_list_tools", {
      sessionId: session.sessionId,
    });
    const oneShotResources = await callWrapperTool(client, "stdio_mcp_list_resources", launchInput());
    const sessionResources = await callWrapperTool(client, "stdio_mcp_session_list_resources", {
      sessionId: session.sessionId,
    });
    const oneShotRead = await callWrapperTool(client, "stdio_mcp_read_resource", {
      ...launchInput(),
      uri: "fake://resource/demo",
    });
    const sessionRead = await callWrapperTool(client, "stdio_mcp_session_read_resource", {
      sessionId: session.sessionId,
      uri: "fake://resource/demo",
    });
    const oneShotPrompts = await callWrapperTool(client, "stdio_mcp_list_prompts", launchInput());
    const sessionPrompts = await callWrapperTool(client, "stdio_mcp_session_list_prompts", {
      sessionId: session.sessionId,
    });
    const oneShotPrompt = await callWrapperTool(client, "stdio_mcp_get_prompt", {
      ...launchInput(),
      name: "fake_prompt",
      arguments: { who: "world" },
    });
    const sessionPrompt = await callWrapperTool(client, "stdio_mcp_session_get_prompt", {
      sessionId: session.sessionId,
      name: "fake_prompt",
      arguments: { who: "world" },
    });

    assert.deepEqual(sessionTools.structuredContent, oneShotTools.structuredContent);
    assert.deepEqual(sessionResources.structuredContent, oneShotResources.structuredContent);
    assert.deepEqual(sessionRead.structuredContent, oneShotRead.structuredContent);
    assert.deepEqual(sessionPrompts.structuredContent, oneShotPrompts.structuredContent);
    assert.deepEqual(sessionPrompt.structuredContent, oneShotPrompt.structuredContent);
  });
});

test("exposes session diagnostics including stderr tail", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);

    const toolResult = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "stderr_tool",
      arguments: { lines: ["line-one", "line-two"] },
    });
    assert.equal(toolResult.isError, false);

    const diagnostics = await callWrapperTool(client, "stdio_mcp_get_session", {
      sessionId: session.sessionId,
    });
    assert.equal(diagnostics.isError, false);
    assert.equal(diagnostics.structuredContent.status, "open");
    assert.equal(diagnostics.structuredContent.pid, session.pid);
    assert.match(diagnostics.structuredContent.startedAt, /\d{4}-\d{2}-\d{2}T/);
    assert.match(diagnostics.structuredContent.lastUsedAt, /\d{4}-\d{2}-\d{2}T/);
    assert.match(diagnostics.structuredContent.stderrTail, /line-one/);
    assert.match(diagnostics.structuredContent.stderrTail, /line-two/);
  });
});

test("close_session returns final diagnostics and removes the record", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);
    await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "stderr_tool",
      arguments: { lines: ["closing-line"] },
    });

    const closed = await callWrapperTool(client, "stdio_mcp_close_session", {
      sessionId: session.sessionId,
    });
    assert.equal(closed.isError, false);
    assert.equal(closed.structuredContent.status, "closed");
    assert.equal(closed.structuredContent.closeReason, "explicit_close");
    assert.match(closed.structuredContent.stderrTail, /closing-line/);

    const missing = await callWrapperTool(client, "stdio_mcp_get_session", {
      sessionId: session.sessionId,
    });
    assert.equal(missing.isError, true);
    assert.match(toolText(missing), /was not found/);
  });
});

test("idle timeout closes the session and keeps a terminal diagnostic record", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client, {
      idleTimeoutMs: 100,
      hardTimeoutMs: 1000,
    });

    await wait(250);

    const diagnostics = await callWrapperTool(client, "stdio_mcp_get_session", {
      sessionId: session.sessionId,
    });
    assert.equal(diagnostics.isError, false);
    assert.equal(diagnostics.structuredContent.status, "closed");
    assert.equal(diagnostics.structuredContent.closeReason, "idle_timeout");

    const closed = await callWrapperTool(client, "stdio_mcp_close_session", {
      sessionId: session.sessionId,
    });
    assert.equal(closed.isError, false);
  });
});

test("hard timeout closes the session and keeps a terminal diagnostic record", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client, {
      idleTimeoutMs: 1000,
      hardTimeoutMs: 100,
    });

    await wait(250);

    const diagnostics = await callWrapperTool(client, "stdio_mcp_get_session", {
      sessionId: session.sessionId,
    });
    assert.equal(diagnostics.isError, false);
    assert.equal(diagnostics.structuredContent.status, "closed");
    assert.equal(diagnostics.structuredContent.closeReason, "hard_timeout");

    const closed = await callWrapperTool(client, "stdio_mcp_close_session", {
      sessionId: session.sessionId,
    });
    assert.equal(closed.isError, false);
  });
});

test("unexpected target exit marks the session terminal and preserves diagnostics", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);

    const result = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "exit_tool",
      arguments: { code: 17 },
      timeoutMs: 1000,
    });

    assert.equal(result.isError, true);
    assert.match(toolText(result), /target_exit|closed/);
    assert.match(toolText(result), /fake-target exiting: 17/);

    const diagnostics = await callWrapperTool(client, "stdio_mcp_get_session", {
      sessionId: session.sessionId,
    });
    assert.equal(diagnostics.isError, false);
    assert.equal(diagnostics.structuredContent.status, "closed");
    assert.equal(diagnostics.structuredContent.closeReason, "target_exit");
    assert.equal(diagnostics.structuredContent.exitCode, 17);
    assert.match(diagnostics.structuredContent.stderrTail, /fake-target exiting: 17/);
  });
});

test("rejects overlapping operations on the same session", async () => {
  await withWrapper(async (client) => {
    const session = await openSession(client);

    const slowCall = callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "slow_tool",
      arguments: { delayMs: 300 },
      timeoutMs: 1000,
    });

    await wait(50);

    const overlapping = await callWrapperTool(client, "stdio_mcp_session_call_tool", {
      sessionId: session.sessionId,
      name: "echo_tool",
      arguments: { text: "second" },
    });
    assert.equal(overlapping.isError, true);
    assert.match(toolText(overlapping), /in-flight operation/);

    const finished = await slowCall;
    assert.equal(finished.isError, false);
  });
});
