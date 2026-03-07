import "dotenv/config";
import {
  MemoryState,
  addMessage,
  formatHistory,
  shouldSummarize,
  summarizeHistory,
  rememberQuery,
  recallSimilarQueries,
} from "../../src/memory/memory.js";

// ── Test Layer 1: Short-term ───────────────────────────────
console.log("=== LAYER 1: SHORT-TERM MEMORY ===\n");

let state: MemoryState = { history: [] };

state = addMessage(state, {
  role: "user",
  content: "show me top customers",
  timestamp: Date.now(),
});
state = addMessage(state, {
  role: "assistant",
  content: "Found 5 VIP customers...",
  timestamp: Date.now(),
});
state = addMessage(state, {
  role: "user",
  content: "what did they buy?",
  timestamp: Date.now(),
});
state = addMessage(state, {
  role: "assistant",
  content: "They bought electronics mainly",
  timestamp: Date.now(),
});

console.log("History so far:");
console.log(formatHistory(state));
console.log("\nShould summarize?", shouldSummarize(state));

// ── Test Layer 2: Summarization ────────────────────────────
console.log("\n=== LAYER 2: SUMMARIZATION ===\n");

// Fill up history past the limit to trigger summarization
for (let i = 0; i < 8; i++) {
  state = addMessage(state, {
    role: "user",
    content: `question ${i}`,
    timestamp: Date.now(),
  });
  state = addMessage(state, {
    role: "assistant",
    content: `answer ${i}`,
    timestamp: Date.now(),
  });
}

console.log(`History length: ${state.history.length}`);
console.log("Should summarize?", shouldSummarize(state));

if (shouldSummarize(state)) {
  state = await summarizeHistory(state);
  console.log("\nAfter summarization:");
  console.log("Fresh messages kept:", state.history.length);
  console.log("Summary:", state.summary);
}

// ── Test Layer 3: Long-term memory ────────────────────────
console.log("\n=== LAYER 3: LONG-TERM MEMORY ===\n");

// Store some successful queries
await rememberQuery(
  "top customers by lifetime value",
  "SELECT name, lifetime_value FROM customers ORDER BY lifetime_value DESC LIMIT 5",
  "test-session",
);

await rememberQuery(
  "products below reorder level",
  "SELECT name, stock_quantity, reorder_level FROM products WHERE stock_quantity < reorder_level",
  "test-session",
);

// Now recall similar queries
console.log("\nRecalling for: 'show me best customers by revenue'");
const recalled = await recallSimilarQueries(
  "show me best customers by revenue",
);
console.log(recalled);

console.log("\nRecalling for: 'which items need to be restocked'");
const recalled2 = await recallSimilarQueries(
  "which items need to be restocked",
);
console.log(recalled2);
