import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  DEFAULT_HARD_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  STDERR_TAIL_MAX_CHARS,
  buildLaunchEnv,
  tailText,
  withTimeout,
} from "./core.mjs";

function now() {
  return new Date().toISOString();
}

function createTimer(callback, timeoutMs) {
  const timer = setTimeout(callback, timeoutMs);
  timer.unref?.();
  return timer;
}

export class SessionManager {
  constructor(clientInfo) {
    this.clientInfo = clientInfo;
    this.sessions = new Map();
    this.hasRegisteredShutdownHooks = false;
    this.registerShutdownHooks();
  }

  registerShutdownHooks() {
    if (this.hasRegisteredShutdownHooks) {
      return;
    }

    this.hasRegisteredShutdownHooks = true;
    const shutdown = () => {
      void this.closeAll("wrapper_shutdown");
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("beforeExit", shutdown);
  }

  createSession(launch) {
    const transport = new StdioClientTransport({
      command: launch.command,
      args: launch.args,
      cwd: launch.cwd,
      env: buildLaunchEnv(launch),
      stderr: "pipe",
    });

    const client = new Client(this.clientInfo, { capabilities: {} });
    const startedAt = now();
    const session = {
      sessionId: randomUUID(),
      client,
      transport,
      startedAt,
      lastUsedAt: startedAt,
      idleTimeoutMs: launch.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      hardTimeoutMs: launch.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS,
      status: "opening",
      inFlight: false,
      closeReason: null,
      pendingCloseReason: null,
      exitCode: null,
      pid: null,
      stderrTail: "",
      idleTimer: null,
      hardTimer: null,
      closePromise: null,
      removed: false,
      observedChild: null,
    };

    transport.stderr?.on("data", (chunk) => {
      session.stderrTail = tailText(`${session.stderrTail}${chunk.toString()}`, STDERR_TAIL_MAX_CHARS);
    });

    return session;
  }

  observeChild(session) {
    const child = session.transport._process;
    if (!child || session.observedChild === child) {
      return;
    }

    session.observedChild = child;
    child.once("exit", (code) => {
      if (typeof code === "number") {
        session.exitCode = code;
      }
    });
    child.once("close", (code) => {
      if (typeof code === "number") {
        session.exitCode = code;
      }
      if (!session.removed) {
        this.markClosed(session, session.pendingCloseReason ?? "target_exit");
      }
    });
  }

  buildSnapshot(session) {
    return {
      sessionId: session.sessionId,
      status: session.inFlight && session.status !== "closed" ? "busy" : session.status,
      pid: session.pid,
      startedAt: session.startedAt,
      lastUsedAt: session.lastUsedAt,
      closeReason: session.closeReason,
      exitCode: session.exitCode,
      stderrTail: session.stderrTail || null,
    };
  }

  buildOpenSnapshot(session) {
    return {
      ...this.buildSnapshot(session),
      idleTimeoutMs: session.idleTimeoutMs,
      hardTimeoutMs: session.hardTimeoutMs,
    };
  }

  getSessionRecord(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found.`);
    }
    return session;
  }

  getSessionSnapshot(sessionId) {
    return this.buildSnapshot(this.getSessionRecord(sessionId));
  }

  clearIdleTimer(session) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }

  clearHardTimer(session) {
    if (session.hardTimer) {
      clearTimeout(session.hardTimer);
      session.hardTimer = null;
    }
  }

  clearAllTimers(session) {
    this.clearIdleTimer(session);
    this.clearHardTimer(session);
  }

  scheduleIdleTimeout(session) {
    this.clearIdleTimer(session);
    if (session.status === "closed") {
      return;
    }

    session.idleTimer = createTimer(() => {
      void this.terminateSession(session, "idle_timeout");
    }, session.idleTimeoutMs);
  }

  scheduleHardTimeout(session) {
    this.clearHardTimer(session);
    if (session.status === "closed") {
      return;
    }

    session.hardTimer = createTimer(() => {
      void this.terminateSession(session, "hard_timeout");
    }, session.hardTimeoutMs);
  }

  markClosed(session, reason) {
    session.pendingCloseReason = null;
    session.inFlight = false;
    session.status = "closed";
    session.closeReason ??= reason;
    session.lastUsedAt = now();
    this.clearAllTimers(session);
  }

  formatError(error, session) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(session.stderrTail ? `${message}\n\nTarget stderr tail:\n${session.stderrTail}` : message);
  }

  formatOperationError(error, session) {
    let message = error instanceof Error ? error.message : String(error);
    if (session.status === "closed") {
      const closeSuffix = session.exitCode === null
        ? `Session ${session.sessionId} closed (${session.closeReason ?? "unknown"}).`
        : `Session ${session.sessionId} closed (${session.closeReason ?? "unknown"}, exit code ${session.exitCode}).`;
      message = `${message}\n\n${closeSuffix}`;
    }
    if (session.stderrTail) {
      message = `${message}\n\nTarget stderr tail:\n${session.stderrTail}`;
    }
    return new Error(message);
  }

  assertUsable(session) {
    if (session.status === "closed") {
      throw new Error(
        `Session ${session.sessionId} is closed (${session.closeReason ?? "unknown"}). Use stdio_mcp_close_session to discard it and open a new session.`,
      );
    }
    if (session.inFlight) {
      throw new Error(`Session ${session.sessionId} already has an in-flight operation.`);
    }
  }

  async openSession(launch) {
    const session = this.createSession(launch);
    this.sessions.set(session.sessionId, session);

    try {
      await withTimeout(session.client.connect(session.transport), launch.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS);
      session.pid = session.transport.pid;
      this.observeChild(session);
      session.status = "open";
      session.lastUsedAt = now();
      this.scheduleIdleTimeout(session);
      this.scheduleHardTimeout(session);
      return this.buildOpenSnapshot(session);
    } catch (error) {
      this.sessions.delete(session.sessionId);
      session.removed = true;
      await session.client.close().catch(() => {});
      throw this.formatError(error, session);
    }
  }

  async terminateSession(session, reason) {
    if (session.status === "closed") {
      return session;
    }
    if (session.closePromise) {
      await session.closePromise;
      return session;
    }

    session.pendingCloseReason = reason;
    this.clearAllTimers(session);
    session.closePromise = (async () => {
      try {
        await session.client.close().catch(() => {});
      } finally {
        this.markClosed(session, reason);
        session.closePromise = null;
      }
    })();

    await session.closePromise;
    return session;
  }

  async closeSession(sessionId) {
    const session = this.getSessionRecord(sessionId);
    if (session.inFlight) {
      throw new Error(`Session ${session.sessionId} already has an in-flight operation.`);
    }
    if (session.status !== "closed") {
      await this.terminateSession(session, "explicit_close");
    }

    const snapshot = this.buildSnapshot(session);
    this.sessions.delete(session.sessionId);
    session.removed = true;
    return snapshot;
  }

  async closeAll(reason) {
    await Promise.all(
      [...this.sessions.values()].map(async (session) => {
        if (session.status !== "closed") {
          await this.terminateSession(session, reason).catch(() => {});
        }
      }),
    );
  }

  async runSessionOperation(sessionId, timeoutMs, operation) {
    const session = this.getSessionRecord(sessionId);
    this.assertUsable(session);

    session.inFlight = true;
    session.lastUsedAt = now();
    this.clearIdleTimer(session);

    try {
      this.observeChild(session);
      return await withTimeout(
        operation(session.client, {
          stderrTail() {
            return session.stderrTail;
          },
        }),
        timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      throw this.formatOperationError(error, session);
    } finally {
      session.inFlight = false;
      session.lastUsedAt = now();
      if (session.status !== "closed") {
        this.scheduleIdleTimeout(session);
      }
    }
  }
}
