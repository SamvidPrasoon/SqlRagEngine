import { checkGuardrails } from "../../guardrails/sqlGuard.js";
import type { AgentState } from "../../types/agentState.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function checkGuardrailsNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "check_guardrails", { 
    sql: state.generatedSQL,
    mode: state.mode,
  });

  console.log("\n[Node 4] check_guardrails");
  console.log("Mode:", state.mode);
  console.log("SQL:", state.generatedSQL);

  try {
    // No SQL generated at all
    if (!state.generatedSQL || state.sqlValidationErrors.length > 0) {
      const result = {
        riskLevel: "blocked" as const,
        reason: state.sqlValidationErrors.join(", ") || "No valid SQL was generated",
        requiresHITL: false,
      };
      span?.end(result);
      return {
        riskLevel: result.riskLevel,
        guardReason: result.reason,
        hitlRequired: result.requiresHITL,
      };
    }

    const result = checkGuardrails(state.generatedSQL, state.mode);

    console.log("🛡️  Risk level:", result.riskLevel);
    console.log("📋 Reason:", result.reason);
    console.log("👤 Needs HITL:", result.requiresHITL);

    span?.end(result);

    return {
      riskLevel: result.riskLevel,
      guardReason: result.reason,
      hitlRequired: result.requiresHITL,
    };
  } catch (error) {
    span?.end({ error: String(error) });
    throw error;
  }
}
