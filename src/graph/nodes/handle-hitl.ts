import { interrupt, Command } from "@langchain/langgraph";
import type { AgentState } from "../../types/agentState.js";

export async function handleHITL(
  state: AgentState,
): Promise<Command | Partial<AgentState>> {
  console.log("\n[Node 8] handle_hitl");
  console.log("SQL requiring approval:", state.generatedSQL);
  console.log("Risk level:", state.riskLevel);

  // This is all we need — one line
  // LangGraph pauses here and saves state to checkpointer
  const approved = interrupt({
    message: "Approve this SQL query?",
    sql: state.generatedSQL,
    riskLevel: state.riskLevel,
    userMessage: state.userMessage,
    sessionId: state.sessionId,
  });

  // This code only runs AFTER graph.invoke(new Command({ resume: true/false }))
  if (approved) {
    console.log("✅ Approved — routing to execute");
    return new Command({ goto: "execute_query" });
  }

  console.log("❌ Rejected");
  return {
    hitlStatus: "rejected",
    finalResponse: `❌ Query rejected by reviewer.\nSQL: ${state.generatedSQL}`,
  };
}
