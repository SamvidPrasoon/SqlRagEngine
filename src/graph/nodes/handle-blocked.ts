import { HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import { getLLM } from "../../llm/llm.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function handleBlocked(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "handle_blocked", { reason: state.guardReason });

  console.log("\n[Node 7] handle_blocked");
  console.log("Reason:", state.guardReason);

  try {
    const llm = getLLM();

    const response = await llm.invoke([
      new HumanMessage(
        `The user asked: "${state.userMessage}"
  This was blocked because: ${state.guardReason}

  Write a friendly 1-2 sentence explanation.
  Tell them what they can ask instead (read-only questions are fine).
  Do NOT "guardrails", mention technical terms like "business mode", or "SQL".
  Be helpful, not robotic.`,
      ),
    ]);

    const finalResponse = String(response.content).trim();

    if (state.trace && typeof state.trace.score === "function") {
      state.trace.score("blocked", 1, state.guardReason);
    }

    span?.end({ finalResponse });

    return {
      finalResponse,
    };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
