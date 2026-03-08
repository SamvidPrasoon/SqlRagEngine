
import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import { getLLM } from "../../llm/llm.js";
import { rememberQuery } from "../../memory/memory.js";
import { scoreContextPrecision, scoreFaithfulness } from "../../Ragas/eval.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function summarizeResults(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "summarize_results", { question: state.userMessage });

  console.log("\n[Node 6] summarize_results");

  try {
    //  If execution failed completely 
    if (!state.queryResult) {
      span?.end({ error: "query_failed", retries: state.retryCount });
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

    if (state.trace && typeof state.trace.score === "function") {
      state.trace.score("context_precision", contextPrecision);
      state.trace.score("faithfulness", faithfulness);
    }

    // ── Save to long-term memory ───────────────────────────
    // Only save if it actually worked
    await rememberQuery(state.userMessage, state.generatedSQL, state.sessionId);
    console.log("💾 Saved to long-term memory");

    span?.end({ summary, rowCount: state.queryResult.rowCount });

    return { finalResponse: summary };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
