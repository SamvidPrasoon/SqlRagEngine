import "dotenv/config";
import { buildAgent } from "../../src/graph/agent.js";
import { MemoryState } from "../../src/memory/memory.js";
import { createTrace } from "../../src/observability/tracer.js";

const agent = buildAgent();

// Helper to run a question through the full graph
async function ask(
  question: string,
  mode: "business" | "dev" = "business",
  memoryState: MemoryState = { history: [] },
) {
  console.log("\n" + "═".repeat(60));
  console.log(`❓ ${question}`);
  console.log(`🔒 Mode: ${mode}`);
  console.log("═".repeat(60));

  const trace = createTrace({
    sessionId: "test-session",
    input: question,
    mode,
  });

  const result = await agent.invoke({
    userMessage: question,
    sessionId: "test-session",
    mode,
    memoryState,
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
    trace,
  });

  trace.end({ finalResponse: result.finalResponse });

  console.log("\n✅ FINAL RESPONSE:");
  console.log(result.finalResponse);
  console.log("\n📝 SQL:", result.generatedSQL);
  console.log("⚠️  Risk:", result.riskLevel);
  console.log("🔁 Retries:", result.retryCount);

  return result;
}

// ── Test 1: Safe business query ────────────────────────────
const r1 = await ask("who are our top 5 customers by lifetime value?");

// ── Test 2: Blocked in business mode ──────────────────────
await ask("DELETE FROM customers WHERE id = 1", "business");

// ── Test 3: Multi-turn memory ──────────────────────────────
// Second question refers to "they" — needs memory context
const r3 = await ask(
  "what orders did they place?",
  "business",
  r1.memoryState, // pass memory from test 1
);

// ── Test 4: Dev mode write — triggers HITL ─────────────────
// Comment this out for now — HITL waits for human input
// await ask("INSERT INTO customers (name, email) VALUES ('Test', 'test@test.com')", "dev");
