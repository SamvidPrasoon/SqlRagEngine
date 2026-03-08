import type { AgentState } from "../../types/agentState.js";
import { recallSimilarQueries } from "../../memory/memory.js";
import { retrieveSchema } from "../../rag/ingestion.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function retrieveContext(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "retrieve_context", { question: state.userMessage });

  console.log("\n [Node 1] retrieve_context");
  console.log("Question:", state.userMessage);

  try {
    const [schemaContext, pastExamples] = await Promise.all([
      retrieveSchema(state.userMessage),
      recallSimilarQueries(state.userMessage),
    ]);
    console.log("✅ Schema retrieved:", schemaContext.slice(0, 100) + "...");
    console.log("✅ Past examples:", pastExamples ? "Found" : "None yet");
    
    span?.end({ schemaContext, pastExamples });
    
    return {
      schemaContext,
      pastExamples,
    };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
