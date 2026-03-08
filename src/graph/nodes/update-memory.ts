import type { AgentState } from "../../types/agentState.js";
import {
  addMessage,
  shouldSummarize,
  summarizeHistory,
} from "../../memory/memory.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function updateMemory(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "update_memory", { sessionId: state.sessionId });

  console.log("\n[Node 9] update_memory");

  try {
    let memory = state.memoryState;

    // Add this turn to history
    memory = addMessage(memory, {
      role: "user",
      content: state.userMessage,
      timestamp: Date.now(),
    });

    memory = addMessage(memory, {
      role: "assistant",
      content: state.finalResponse,
      timestamp: Date.now(),
    });

    console.log("History length:", memory.history.length);

    // Summarize if too long
    if (shouldSummarize(memory)) {
      console.log("📋 Summarizing...");
      memory = await summarizeHistory(memory);
      console.log("✅ Summarized. Fresh messages:", memory.history.length);
    }

    span?.end({ historyLength: memory.history.length });

    return { memoryState: memory };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
