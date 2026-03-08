import type { AgentState } from "../../types/agentState.js";
import { recallSimilarQueries } from "../../memory/memory.js";
import { retrieveSchema } from "../../rag/ingestion.js";

export async function retrieveContext(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n [Node 1] retrieve_context");
  console.log("Question:", state.userMessage);

  // Run both in parallel — no dependency between them
  const [schemaContext, pastExamples] = await Promise.all([
    retrieveSchema(state.userMessage),
    recallSimilarQueries(state.userMessage),
  ]);
  console.log("✅ Schema retrieved:", schemaContext.slice(0, 100) + "...");
  console.log("✅ Past examples:", pastExamples ? "Found" : "None yet");
  return {
    schemaContext,
    pastExamples,
  };
}
