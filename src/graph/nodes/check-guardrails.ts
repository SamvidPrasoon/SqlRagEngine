import { checkGuardrails } from "../../guardrails/sqlGuard.js";
import type { AgentState } from "../../types/agentState.js";
export async function checkGuardrailsNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 4] check_guardrails");
  console.log("Mode:", state.mode);
  console.log("SQL:", state.generatedSQL);

  // No SQL generated at all
  if (!state.generatedSQL || state.sqlValidationErrors.length > 0) {
    return {
      riskLevel: "blocked",
      guardReason:
        state.sqlValidationErrors.join(", ") || "No valid SQL was generated",
      hitlRequired: false,
    };
  }

  const result = checkGuardrails(state.generatedSQL, state.mode);

  console.log("🛡️  Risk level:", result.riskLevel);
  console.log("📋 Reason:", result.reason);
  console.log("👤 Needs HITL:", result.requiresHITL);

  return {
    riskLevel: result.riskLevel,
    guardReason: result.reason,
    hitlRequired: result.requiresHITL,
  };
}
