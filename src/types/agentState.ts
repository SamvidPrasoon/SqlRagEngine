import { MemoryState } from "../memory/memory.js";

export type AppMode = "business" | "dev";
export type RiskLevel = "safe" | "moderate" | "dangerous" | "blocked";
export type HITLStatus = "pending" | "approved" | "rejected";

export interface AgentState {
  //  Input
  userMessage: string; // what the user asked
  sessionId: string; // which session this belongs to
  mode: AppMode; // business = read only, dev = full access

  //  Memory (flows in from outside)
  memoryState: MemoryState;

  //  RAG output
  schemaContext: string; // relevant schema chunks
  pastExamples: string; // similar past queries

  //  Planning output
  queryPlan: string; // chain of thought plan

  //  SQL generation output
  generatedSQL: string; // the SQL to run
  sqlValidationErrors: string[]; // hallucination check results

  //  Guardrails output
  riskLevel: RiskLevel;
  guardReason: string;
  hitlRequired: boolean;

  //  HITL
  hitlId?: string;
  hitlStatus?: HITLStatus;

  //  Execution output
  queryResult?: {
    rows: Record<string, unknown>[];
    rowCount: number;
    executionTimeMs: number;
    sql: string;
  };
  executionError?: string;
  retryCount: number; // how many times we've retried

  //  Final output
  finalResponse: string;
}
