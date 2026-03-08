import type { AgentState } from "../../types/agentState.js";
import {
  addMessage,
  shouldSummarize,
  summarizeHistory,
} from "../../memory/memory.js";

export async function updateMemory(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 9] update_memory");

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

  return { memoryState: memory };
}
