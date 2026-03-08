import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import { Command } from "@langchain/langgraph";
import { getSchema } from "../db/adapter.js";
import { buildAgent } from "../graph/agent.js";
import type { MemoryState } from "../memory/memory.js";
import { flush } from "../observability/tracer.js";
import type { AppMode } from "../types/agentState.js";
import { hitlStore } from "../graph/nodes/store/hitl-store.js";

// ── App setup ──────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT ?? "3001");

app.use(cors());
app.use(express.json());

// ── Build agent once ───────────────────────────────────────
const agent = buildAgent();

// ── Agent result type ──────────────────────────────────────
// LangGraph doesn't export a clean result type so we define
// what we need here
interface AgentResult {
  memoryState: MemoryState;
  finalResponse: string;
  generatedSQL: string;
  riskLevel: string;
  retryCount: number;
  queryResult?: unknown;
  traceId?: string;
  hitlRequired: boolean;
  __interrupt__?: Array<{
    value: {
      hitlId: string;
      sql: string;
      riskLevel: string;
      userMessage: string;
      sessionId: string;
    };
  }>;
}

// ── Session store ──────────────────────────────────────────
const sessions = new Map<
  string,
  {
    memoryState: MemoryState;
    threadId: string;
  }
>();

function getSession(sessionId: string) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      memoryState: { history: [] },
      threadId: sessionId,
    });
  }
  return sessions.get(sessionId)!;
}

// ══════════════════════════════════════════════════════════
// POST /api/chat
// ══════════════════════════════════════════════════════════
app.post("/api/chat", async (req, res) => {
  const {
    message,
    sessionId = uuid(),
    mode = (process.env.DEFAULT_MODE ?? "business") as AppMode,
  } = req.body as {
    message: string;
    sessionId?: string;
    mode?: AppMode;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const session = getSession(sessionId);
  const config = { configurable: { thread_id: session.threadId } };

  try {
    const result = (await agent.invoke(
      {
        userMessage: message,
        sessionId,
        mode,
        memoryState: session.memoryState,
        schemaContext: "",
        pastExamples: "",
        queryPlan: "",
        generatedSQL: "",
        sqlValidationErrors: [],
        riskLevel: "safe",
        guardReason: "",
        hitlRequired: false,
        retryCount: 0,
        finalResponse: "",
      },
      config,
    )) as AgentResult;

    // Persist memory for next turn
    if (result.memoryState) {
      sessions.set(sessionId, {
        ...session,
        memoryState: result.memoryState,
      });
    }

    // Graph paused for HITL?
    if (result.__interrupt__?.length) {
      const payload = result.__interrupt__[0].value;

      // Register in store so GET /api/hitl can list it
      hitlStore.create({
        id: payload.hitlId,
        sessionId,
        sql: payload.sql,
        queryPlan: "",
        riskLevel: payload.riskLevel,
        userMessage: message,
        createdAt: Date.now(),
        status: "pending",
      });

      return res.json({
        sessionId,
        response: "⏳ Query requires human approval before execution.",
        hitlRequired: true,
        hitlId: payload.hitlId,
        sql: payload.sql,
        riskLevel: payload.riskLevel,
      });
    }

    return res.json({
      sessionId,
      response: result.finalResponse,
      sql: result.generatedSQL || undefined,
      riskLevel: result.riskLevel,
      hitlRequired: false,
      retryCount: result.retryCount,
    });
  } catch (e) {
    console.error("[API] /chat error:", e);
    return res.status(500).json({
      error: "Agent error",
      details: (e as Error).message,
    });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/hitl — list pending requests
// ══════════════════════════════════════════════════════════
app.get("/api/hitl", (_req, res) => {
  res.json({ requests: hitlStore.getPending() });
});

// ══════════════════════════════════════════════════════════
// POST /api/hitl/:id/approve
// ══════════════════════════════════════════════════════════
app.post("/api/hitl/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { note } = req.body as { note?: string };

  const request = hitlStore.approve(id, note);
  if (!request) {
    return res.status(404).json({ error: "HITL request not found" });
  }

  const session = getSession(request.sessionId);
  const config = { configurable: { thread_id: session.threadId } };

  try {
    const result = (await agent.invoke(
      new Command({ resume: true }),
      config,
    )) as AgentResult;

    if (result.memoryState) {
      sessions.set(request.sessionId, {
        ...session,
        memoryState: result.memoryState,
      });
    }

    return res.json({
      approved: true,
      response: result.finalResponse,
      sql: result.generatedSQL,
      queryResult: result.queryResult,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Execution failed after approval",
      details: (e as Error).message,
    });
  }
});

// ══════════════════════════════════════════════════════════
// POST /api/hitl/:id/reject
// ══════════════════════════════════════════════════════════
app.post("/api/hitl/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { note } = req.body as { note?: string };

  const request = hitlStore.reject(id, note);
  if (!request) {
    return res.status(404).json({ error: "HITL request not found" });
  }

  const session = getSession(request.sessionId);
  const config = { configurable: { thread_id: session.threadId } };

  try {
    const result = (await agent.invoke(
      new Command({ resume: false }),
      config,
    )) as AgentResult;

    return res.json({
      approved: false,
      response: result.finalResponse,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Error resuming after rejection",
      details: (e as Error).message,
    });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/schema
// ══════════════════════════════════════════════════════════
app.get("/api/schema", (_req, res) => {
  try {
    const schema = getSchema();
    res.json({ schema });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/health
// ══════════════════════════════════════════════════════════
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: process.env.DEFAULT_MODE ?? "business",
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
    version: "1.0.0",
    uptime: process.uptime(),
  });
});

// ── Graceful shutdown ──────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await flush();
  process.exit(0);
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║       SQLMind API Server              ║
║  http://localhost:${PORT}               ║
║  Mode:  ${(process.env.DEFAULT_MODE ?? "business").padEnd(29)}║
║  Model: ${(process.env.OLLAMA_MODEL ?? "llama3.1").padEnd(29)}║
╚═══════════════════════════════════════╝
  `);
});
