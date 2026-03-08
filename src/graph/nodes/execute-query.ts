import { executeQuery } from "../../db/adapter.js";
import type { AgentState } from "../../types/agentState.js";
export async function executeQueryNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("\n[Node 5] execute_query");
  console.log("Running SQL:", state.generatedSQL);

  try {
    const result = executeQuery(state.generatedSQL);

    console.log(
      `✅ Success: ${result.rowCount} rows in ${result.executionTimeMs}ms`,
    );

    return {
      queryResult: result,
      executionError: undefined, // clear any previous error
    };
  } catch (e) {
    const error = (e as Error).message;
    console.log("❌ Execution failed:", error);

    // The routing function will decide whether to retry
    return {
      executionError: error,
      queryResult: undefined,
    };
  }
}
