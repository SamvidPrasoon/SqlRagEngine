import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import z from "zod";
import { enforceLimit, getSchema, validateSQL } from "../../db/adapter.js";
import { getLLM } from "../../llm/llm.js";
import { formatHistory } from "../../memory/memory.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

// If LLM returns anything else → parse fails → we retry
const SQLOutput = z.object({
  sql: z.string().min(1),
  explanation: z.string(),
  riskLevel: z.enum(["safe", "moderate", "dangerous"]),
});

//  Parse LLM output safely
function parseSQLOutput(raw: string) {
  try {
    // LLMs sometimes wrap JSON in markdown code blocks
    // Strip that before parsing
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    // Zod validates the shape AND the types
    return SQLOutput.parse(parsed);
  } catch {
    // Zod parse failed — try to salvage raw SQL as fallback
    const sqlMatch =
      raw.match(/SELECT[\s\S]+?;/i) ?? raw.match(/SELECT[\s\S]+/i);

    if (sqlMatch) {
      console.log("⚠️  Zod failed, extracted raw SQL as fallback");
      return {
        sql: sqlMatch[0].trim(),
        explanation: "Extracted from unstructured response",
        riskLevel: "safe" as const,
      };
    }

    return null; // complete failure
  }
}

export async function generateSQL(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "generate_sql", { 
    question: state.userMessage,
    retryCount: state.retryCount,
  });

  console.log(`\n[Node 3] generate_sql (attempt ${state.retryCount + 1})`);

  try {
    const llm = getLLM();

    //  Retry context

    const retryContext = state.executionError
      ? `
  ⚠️  YOUR PREVIOUS SQL FAILED — THIS IS RETRY ${state.retryCount}/3
  Previous SQL:  ${state.generatedSQL}
  Error message: ${state.executionError}
  Fix the SQL based on this error. Do not repeat the same mistake.
  `
      : "";

    const response = await llm.invoke([
      new SystemMessage(`You are an expert SQLite query generator.

  DATABASE SCHEMA:
  ${state.schemaContext}

  ${state.pastExamples ? `SIMILAR PAST QUERIES (use these as reference):\n${state.pastExamples}\n` : ""}

  QUERY PLAN (follow this):
  ${state.queryPlan}

  ${formatHistory(state.memoryState) ? `CONVERSATION HISTORY:\n${formatHistory(state.memoryState)}\n` : ""}

  ${retryContext}

  CRITICAL: Respond ONLY with this exact JSON format.
  No markdown. No explanation outside the JSON. Nothing else.

  {
    "sql": "SELECT ...",
    "explanation": "brief description of what this query does",
    "riskLevel": "safe"
  }

  riskLevel must be exactly one of: "safe", "moderate", "dangerous"
  Use ONLY tables and columns that exist in the schema above.
  SQLite syntax only — no MySQL or PostgreSQL specific functions.`),

      new HumanMessage(state.userMessage),
    ]);

    const raw = String(response.content).trim();
    console.log("\n📦 Raw LLM output:\n", raw);

    //  Zod validation
    const parsed = parseSQLOutput(raw);

    if (!parsed) {
      console.log("🚨 Could not parse LLM output");
      span?.end({ error: "parse_failed", retryCount: state.retryCount + 1 });
      return {
        generatedSQL: "",
        executionError: `Failed to parse LLM output: ${raw.slice(0, 200)}`,
        sqlValidationErrors: ["parse_failed"],
        retryCount: state.retryCount + 1,
      };
    }

    console.log("✅ Zod validation passed");
    console.log("📝 SQL:", parsed.sql);
    console.log("📖 Explanation:", parsed.explanation);
    console.log("⚠️  Risk:", parsed.riskLevel);

    //  Hallucination check
    const schemas = getSchema();
    const errors = validateSQL(parsed.sql, schemas);

    if (errors.length > 0) {
      console.log("🚨 Hallucination detected:", errors);
      span?.end({ error: "schema_validation_failed", errors });
      return {
        generatedSQL: parsed.sql,
        sqlValidationErrors: errors,
        executionError: `Schema validation failed: ${errors.join(", ")}`,
        retryCount: state.retryCount + 1,
      };
    }

    //  Enforce row limit
    const safeSql = enforceLimit(parsed.sql);

    span?.end({ sql: safeSql, riskLevel: parsed.riskLevel });

    return {
      generatedSQL: safeSql,
      sqlValidationErrors: [],
      executionError: undefined, // clear any previous error
    };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
