import {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { MemoryState } from "../memory/memory.js";
import {
  AppMode,
  RiskLevel,
  HITLStatus,
  AgentState,
} from "../types/agentState.js";
import { checkGuardrailsNode } from "./nodes/check-guardrails.js";
import { executeQueryNode } from "./nodes/execute-query.js";
import { generateSQL } from "./nodes/generate-sql.js";
import { handleBlocked } from "./nodes/handle-blocked.js";
import { handleHITL } from "./nodes/handle-hitl.js";
import { planQuery } from "./nodes/plan-query.js";
import { retrieveContext } from "./nodes/retrieve-context.js";
import { summarizeResults } from "./nodes/summarize-results.js";
import { updateMemory } from "./nodes/update-memory.js";

const StateAnnotation = Annotation.Root({
  // Input
  userMessage: Annotation<string>({ reducer: (_, b) => b }),
  sessionId: Annotation<string>({ reducer: (_, b) => b }),
  mode: Annotation<AppMode>({ reducer: (_, b) => b }),

  // Memory
  memoryState: Annotation<MemoryState>({ reducer: (_, b) => b }),

  // RAG output
  schemaContext: Annotation<string>({ reducer: (_, b) => b }),
  pastExamples: Annotation<string>({ reducer: (_, b) => b }),

  // Planning
  queryPlan: Annotation<string>({ reducer: (_, b) => b }),

  // SQL generation
  generatedSQL: Annotation<string>({ reducer: (_, b) => b }),
  sqlValidationErrors: Annotation<string[]>({ reducer: (_, b) => b }),

  // Guardrails
  riskLevel: Annotation<RiskLevel>({ reducer: (_, b) => b }),
  guardReason: Annotation<string>({ reducer: (_, b) => b }),
  hitlRequired: Annotation<boolean>({ reducer: (_, b) => b }),

  // HITL
  hitlId: Annotation<string | undefined>({ reducer: (_, b) => b }),
  hitlStatus: Annotation<HITLStatus | undefined>({ reducer: (_, b) => b }),

  // Execution
  queryResult: Annotation<AgentState["queryResult"]>({
    reducer: (_, b) => b,
  }),
  executionError: Annotation<string | undefined>({ reducer: (_, b) => b }),
  retryCount: Annotation<number>({ reducer: (_, b) => b }),

  // Output
  finalResponse: Annotation<string>({ reducer: (_, b) => b }),
});

export type GraphState = typeof StateAnnotation.State;

// ROUTING FUNCTIONS

// After check_guardrails — three possible paths
function routeAfterGuardrails(state: GraphState): string {
  if (state.riskLevel === "blocked") {
    console.log("\n🔀 Route: blocked → handle_blocked");
    return "handle_blocked";
  }
  if (state.hitlRequired) {
    console.log("\n🔀 Route: hitl required → handle_hitl");
    return "handle_hitl";
  }
  console.log("\n🔀 Route: safe → execute_query");
  return "execute_query";
}

// After execute_query — retry or move forward
function routeAfterExecution(state: GraphState): string {
  const maxRetries = parseInt(process.env.MAX_QUERY_RETRIES ?? "3");

  if (state.executionError && state.retryCount < maxRetries) {
    console.log(
      `\n🔀 Route: failed → retry (${state.retryCount}/${maxRetries})`,
    );
    return "generate_sql"; // loop back — error recovery
  }

  console.log("\n🔀 Route: success → summarize_results");
  return "summarize_results";
}

// After handle_hitl — approved continues, rejected ends
function routeAfterHITL(state: GraphState): string {
  if (state.hitlStatus === "approved") {
    console.log("\n🔀 Route: hitl approved → execute_query");
    return "execute_query";
  }
  console.log("\n🔀 Route: hitl rejected → update_memory");
  return "update_memory";
}

// BUILD AND COMPILE THE GRAPH

export function buildAgent() {
  const graph = new StateGraph(StateAnnotation)

    //  Register all nodes
    .addNode("retrieve_context", retrieveContext)
    .addNode("plan_query", planQuery)
    .addNode("generate_sql", generateSQL)
    .addNode("check_guardrails", checkGuardrailsNode)
    .addNode("execute_query", executeQueryNode)
    .addNode("summarize_results", summarizeResults)
    .addNode("handle_blocked", handleBlocked)
    .addNode("handle_hitl", handleHITL)
    .addNode("update_memory", updateMemory)

    // START → first node
    .addEdge(START, "retrieve_context")

    // Linear flow at the top
    .addEdge("retrieve_context", "plan_query")
    .addEdge("plan_query", "generate_sql")
    .addEdge("generate_sql", "check_guardrails")

    // Conditional: guardrails decides the path
    .addConditionalEdges("check_guardrails", routeAfterGuardrails, {
      handle_blocked: "handle_blocked",
      handle_hitl: "handle_hitl",
      execute_query: "execute_query",
    })

    // Conditional: execution decides retry or summarize
    .addConditionalEdges("execute_query", routeAfterExecution, {
      generate_sql: "generate_sql", // retry loop
      summarize_results: "summarize_results",
    })

    // Conditional: hitl approved or rejected
    .addConditionalEdges("handle_hitl", routeAfterHITL, {
      execute_query: "execute_query",
      update_memory: "update_memory",
    })

    // Everything converges to update_memory then END
    .addEdge("summarize_results", "update_memory")
    .addEdge("handle_blocked", "update_memory")
    .addEdge("update_memory", END);

  // compile()
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}
