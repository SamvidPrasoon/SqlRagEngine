import "dotenv/config";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { executeQuery, getSchema, validateSQL } from "../db/adapter.js";
import {
  MemoryState,
  recallSimilarQueries,
  formatHistory,
  addMessage,
  rememberQuery,
  shouldSummarize,
  summarizeHistory,
} from "../memory/memory.js";
import { retrieveSchema } from "../rag/ingestion.js";

export function getLLM() {
  return new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    temperature: 0.1,
  });
}

export async function askDatabase(
  question: string,
  memoryState: MemoryState = { history: [] },
  sessionId: string = "default",
): Promise<{
  result?: ReturnType<typeof executeQuery>;
  sql?: string;
  error?: string;
  memoryState: MemoryState;
}> {
  const llm = getLLM();

  // ── Step 1: RAG ────────────────────────────────────────
  console.log("\n🔍 [RAG] Retrieving relevant schema...");
  const schemaText = await retrieveSchema(question);

  // ── Step 2: Long-term memory ───────────────────────────
  console.log("\n🧠 [Long-term memory] Recalling similar queries...");
  const pastExamples = await recallSimilarQueries(question);
  if (pastExamples) {
    console.log("📚 Found past examples:\n", pastExamples);
  } else {
    console.log("📭 No similar past queries found yet");
  }

  // ── Step 3: Short-term memory ──────────────────────────
  console.log("\n💬 [Short-term memory] Current history...");
  const historyText = formatHistory(memoryState);
  if (historyText) {
    console.log("📜 History:\n", historyText);
  } else {
    console.log("📭 No history yet");
  }

  // ── Step 4: Build prompt ───────────────────────────────
  const systemPrompt = `You are an expert SQLite query generator.

SCHEMA (retrieved by RAG):
${schemaText}

${pastExamples ? `SIMILAR PAST QUERIES (long-term memory):\n${pastExamples}\n` : ""}

${historyText ? `CONVERSATION HISTORY (short-term memory):\n${historyText}\n` : ""}

RULES:
- Only use tables and columns from the schema above
- SQLite syntax only  
- Respond with ONLY the raw SQL query
- No markdown, no backticks, no explanation
`;

  // ── Step 5: Call LLM ───────────────────────────────────
  console.log("\n🤖 Calling LLM...");
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(question),
  ]);

  // ── Step 6: Extract SQL ────────────────────────────────
  // Clean up common LLM noise
  let sql = String(response.content)
    .trim()
    .replace(/```sql/gi, "")
    .replace(/```/g, "")
    .trim();

  console.log("\n📝 Generated SQL:\n", sql);

  // ── Step 7: Hallucination check ────────────────────────
  const schemas = getSchema();
  const errors = validateSQL(sql, schemas);
  if (errors.length > 0) {
    console.log("\n🚨 Hallucination detected:", errors);

    memoryState = addMessage(memoryState, {
      role: "user",
      content: question,
      timestamp: Date.now(),
    });
    memoryState = addMessage(memoryState, {
      role: "assistant",
      content: `Failed: ${errors.join(", ")}`,
      timestamp: Date.now(),
    });

    return { error: errors.join(", "), sql, memoryState };
  }

  // ── Step 9: Execute ────────────────────────────────────
  console.log("\n⚡ Executing...");
  let result: ReturnType<typeof executeQuery>;
  try {
    result = executeQuery(sql);
    console.log(`\n✅ ${result.rowCount} rows in ${result.executionTimeMs}ms`);
    console.table(result.rows);
  } catch (e) {
    console.log("\n❌ Execution failed:", (e as Error).message);

    memoryState = addMessage(memoryState, {
      role: "user",
      content: question,
      timestamp: Date.now(),
    });
    memoryState = addMessage(memoryState, {
      role: "assistant",
      content: `SQL error: ${(e as Error).message}`,
      timestamp: Date.now(),
    });

    return { error: (e as Error).message, sql, memoryState };
  }

  // ── Step 10: Save to long-term memory ─────────────────
  console.log("\n💾 [Long-term memory] Saving successful query...");
  await rememberQuery(question, sql, sessionId);

  // ── Step 11: Update short-term memory ─────────────────
  console.log("\n📝 [Short-term memory] Adding this turn...");
  memoryState = addMessage(memoryState, {
    role: "user",
    content: question,
    timestamp: Date.now(),
  });
  memoryState = addMessage(memoryState, {
    role: "assistant",
    content: `Ran: ${sql} — got ${result.rowCount} rows`,
    timestamp: Date.now(),
  });

  // ── Step 12: Summarize if too long ─────────────────────
  if (shouldSummarize(memoryState)) {
    console.log("\n📋 [Memory] Summarizing old turns...");
    memoryState = await summarizeHistory(memoryState);
    console.log("✅ Done. Fresh messages kept:", memoryState.history.length);
  }

  return { result, sql, memoryState };
}
