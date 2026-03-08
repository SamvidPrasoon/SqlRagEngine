import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentState } from "../../types/agentState.js";
import { getLLM } from "../../llm/llm.js";
import { formatHistory } from "../../memory/memory.js";

export async function planQuery(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 2] plan_query");

  const llm = getLLM();

  const response = await llm.invoke([
    new SystemMessage(`You are a SQL planning assistant for SQLite.

DATABASE SCHEMA:
${state.schemaContext}

${state.pastExamples ? `SIMILAR PAST QUERIES:\n${state.pastExamples}\n` : ""}

${formatHistory(state.memoryState) ? `CONVERSATION HISTORY:\n${formatHistory(state.memoryState)}\n` : ""}

Your job: write a SHORT bullet point plan to answer the user's question.
- Which tables are needed?
- Which columns?
- Any JOINs needed?
- Any aggregations (SUM, COUNT, AVG)?
- Any filters (WHERE)?
- Any ordering (ORDER BY)?
- Any window functions (RANK) ?

Write ONLY the plan. No SQL yet. Max 6 bullet points.`),

    new HumanMessage(state.userMessage),
  ]);

  const queryPlan = String(response.content).trim();
  console.log("📋 Plan:\n", queryPlan);

  return { queryPlan };
}
