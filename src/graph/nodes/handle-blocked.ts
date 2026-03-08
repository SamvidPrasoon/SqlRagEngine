import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import { getLLM } from "../../llm/llm.js";

export async function handleBlocked(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 7] handle_blocked");
  console.log("Reason:", state.guardReason);

  const llm = getLLM();

  const response = await llm.invoke([
    new HumanMessage(
      `The user asked: "${state.userMessage}"
This was blocked because: ${state.guardReason}

Write a friendly 1-2 sentence explanation.
Tell them what they can ask instead (read-only questions are fine).
Do NOT mention technical terms like "guardrails", "business mode", or "SQL".
Be helpful, not robotic.`,
    ),
  ]);

  return {
    finalResponse: `${String(response.content).trim()}`,
  };
}
