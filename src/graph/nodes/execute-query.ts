import { executeQuery } from "../../db/adapter.js";
import type { AgentState } from "../../types/agentState.js";

function safeSpan(trace: AgentState["trace"], name: string, input?: unknown) {
  if (trace && typeof trace.span === "function") {
    return trace.span(name, input);
  }
  return null;
}

export async function executeQueryNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const span = safeSpan(state.trace, "execute_query", { sql: state.generatedSQL });

  console.log("\n[Node 5] execute_query");
  console.log("Running SQL:", state.generatedSQL);

  try {
    const result = executeQuery(state.generatedSQL);

    console.log(
      `✅ Success: ${result.rowCount} rows in ${result.executionTimeMs}ms`,
    );

    if (state.trace && typeof state.trace.score === "function") {
      state.trace.score("query_success", 1);
    }

    span?.end({ rowCount: result.rowCount, executionTimeMs: result.executionTimeMs });

    return {
      queryResult: result,
      executionError: undefined,
    };
  } catch (e) {
    const error = (e as Error).message;
    console.log("❌ Execution failed:", error);

    if (state.trace && typeof state.trace.score === "function") {
      state.trace.score("query_success", 0, error);
    }

    span?.end({ error });

    // The routing function will decide whether to retry
    return {
      executionError: error,
      queryResult: undefined,
    };
  }
}
