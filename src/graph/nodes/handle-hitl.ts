import { interrupt, Command } from "@langchain/langgraph";
import type { AgentState } from "../../types/agentState.js";
import { hitlStore } from "./store/hitl-store.js";
import { v4 as uuid } from "uuid";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function handleHITL(
  state: AgentState,
): Promise<Command | Partial<AgentState>> {
  const span = safeSpan(state.trace, "handle_hitl", { 
    sql: state.generatedSQL,
    riskLevel: state.riskLevel,
  });

  console.log("\n[Node 8] handle_hitl");
  console.log("SQL requiring approval:", state.generatedSQL);
  console.log("Risk level:", state.riskLevel);

  const hitlId = uuid();
  
  hitlStore.create({
    id: hitlId,
    sessionId: state.sessionId,
    sql: state.generatedSQL,
    queryPlan: state.queryPlan,
    riskLevel: state.riskLevel,
    userMessage: state.userMessage,
    createdAt: Date.now(),
    status: "pending",
  });

  const approved = interrupt({
    hitlId,
    message: "Approve this SQL query?",
    sql: state.generatedSQL,
    riskLevel: state.riskLevel,
    userMessage: state.userMessage,
    sessionId: state.sessionId,
  });

  if (approved === true) {
    console.log("✅ Approved — routing to execute");
    span?.end({ status: "approved" });
    return new Command({
      goto: "execute_query",
      update: { hitlId, hitlStatus: "approved" },
    });
  }

  console.log("❌ Rejected");
  span?.end({ status: "rejected" });
  return {
    hitlId,
    hitlStatus: "rejected",
    finalResponse: `❌ Query rejected by reviewer.\nSQL: ${state.generatedSQL}`,
  };
}
