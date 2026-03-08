
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import { getLLM } from "../../llm/llm.js";
import { rememberQuery } from "../../memory/memory.js";
import { scoreContextPrecision, scoreFaithfulness } from "../../Ragas/eval.js";

export async function summarizeResults(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 6] summarize_results");

  //  If execution failed completely 
  if (!state.queryResult) {
    return {
      finalResponse: `❌ Query failed after ${state.retryCount} retries.\nError: ${state.executionError}`,
    };
  }

  const llm = getLLM();

  // Show LLM at most 15 rows to summarize
  const preview = JSON.stringify(state.queryResult.rows.slice(0, 15), null, 2);

  const response = await llm.invoke([
    new HumanMessage(`The user asked: "${state.userMessage}"

The SQL query returned ${state.queryResult.rowCount} rows in ${state.queryResult.executionTimeMs}ms.

Results:
${preview}

Write a clear, concise 2-3 sentence answer to the user's question.
- Answer directly — lead with the key insight
- Include important numbers
- Be conversational, not robotic`),
  ]);

  const summary = String(response.content).trim();
  console.log("\n💬 Summary:", summary);

  //  RAGAS scoring 
  const contextPrecision = scoreContextPrecision(
    state.schemaContext,
    state.generatedSQL,
  );
  const faithfulness = scoreFaithfulness(summary, state.queryResult.rows);

  console.log("\n📊 RAGAS Scores:");
  console.log(
    "  Context Precision:",
    (contextPrecision * 100).toFixed(0) + "%",
  );
  console.log("  Faithfulness:     ", (faithfulness * 100).toFixed(0) + "%");

  // ── Save to long-term memory ───────────────────────────
  // Only save if it actually worked
  await rememberQuery(state.userMessage, state.generatedSQL, state.sessionId);
  console.log("💾 Saved to long-term memory");

  return { finalResponse: summary };
}
