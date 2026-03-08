// ── SQL pattern classifications ────────────────────────────

import { AppMode, RiskLevel } from "../types/agentState.js";

const INJECTION_PATTERNS = [
  { pattern: /;\s*(DROP|DELETE|TRUNCATE)\b/i, label: "SQL injection" },
  { pattern: /--/, label: "comment injection" },
  { pattern: /\/\*[\s\S]*?\*\//, label: "block comment" },
];

const DESTRUCTIVE_PATTERNS = [
  { pattern: /^\s*DROP\b/i, label: "DROP" },
  { pattern: /^\s*TRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE" },
];

const WRITE_PATTERNS = [
  { pattern: /^\s*INSERT\b/i, label: "INSERT" },
  { pattern: /^\s*UPDATE\b/i, label: "UPDATE" },
  { pattern: /^\s*CREATE\b/i, label: "CREATE" },
  { pattern: /^\s*ALTER\b/i, label: "ALTER" },
];

// ── Main function ──────────────────────────────────────────
export function checkGuardrails(
  sql: string,
  mode: AppMode,
): {
  riskLevel: RiskLevel;
  reason: string;
  requiresHITL: boolean;
} {
  // 1. Injection — always blocked, no exceptions
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(sql)) {
      return {
        riskLevel: "blocked",
        reason: `Blocked: ${label} detected`,
        requiresHITL: false,
      };
    }
  }

  // 2. Destructive operations
  for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sql)) {
      if (mode === "business") {
        return {
          riskLevel: "blocked",
          reason: `Blocked in business mode: ${label} not permitted`,
          requiresHITL: false,
        };
      }
      // dev mode — allowed but needs human approval
      return {
        riskLevel: "dangerous",
        reason: `${label} requires human approval`,
        requiresHITL: true,
      };
    }
  }

  // 3. Write operations
  for (const { pattern, label } of WRITE_PATTERNS) {
    if (pattern.test(sql)) {
      if (mode === "business") {
        return {
          riskLevel: "blocked",
          reason: `Blocked in business mode: ${label} not permitted`,
          requiresHITL: false,
        };
      }
      // dev mode — needs human approval
      return {
        riskLevel: "moderate",
        reason: `${label} requires human approval`,
        requiresHITL: true,
      };
    }
  }

  // 4. Everything else is a safe read
  return {
    riskLevel: "safe",
    reason: "Read-only query",
    requiresHITL: false,
  };
}
