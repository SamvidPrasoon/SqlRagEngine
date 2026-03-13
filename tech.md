# AI Project Technical Reference

> Generic, scenario-based reference for building AI-powered applications. Based on a production-grade SQL Agent implementation.

---

## Table of Contents

1. [Tech Stack Overview](#1-tech-stack-overview)
2. [Agent Orchestration](#2-agent-orchestration-langgraph)
3. [RAG Pipeline](#3-rag-pipeline)
4. [Memory Architecture](#4-memory-architecture)
5. [Guardrails & Safety](#5-guardrails--safety)
6. [Human-in-the-Loop (HITL)](#6-human-in-the-loop-hitl)
7. [LLM Integration](#7-llm-integration)
8. [Database Operations](#8-database-operations)
9. [Observability](#9-observability)
10. [How-To Guides](#10-how-to-guides)
11. [Alternatives & Trade-offs](#11-alternatives--trade-offs)

---

## 1. Tech Stack Overview

### Core Technologies

| Category | Library | Purpose |
|----------|---------|---------|
| **LLM Integration** | `@langchain/ollama` | Local LLM calls via Ollama |
| **Agent Framework** | `@langchain/langgraph` | Graph-based agent orchestration with state management |
| **Embeddings** | `@langchain/ollama` | Generate vector embeddings |
| **Vector Database** | `chromadb` | Store and retrieve embeddings for RAG + memory |
| **Database** | `better-sqlite3` | SQLite with WAL mode for ACID compliance |
| **Server** | `express` + `cors` | REST API endpoints |
| **Validation** | `zod` | Schema validation for structured LLM output |
| **Dev Tools** | `tsx`, `dotenv`, `typescript` | Development workflow |

### Frontend (Not Covered)

The frontend uses React 18 + Vite + Tailwind CSS. This guide focuses on backend AI patterns only.

---

## 2. Agent Orchestration (LangGraph)

### Why LangGraph?

LangGraph provides **graph-based orchestration** vs LangChain's linear chains:

- **State management**: Pass mutable state through all nodes
- **Conditional routing**: Branch based on node outputs
- **Checkpointing**: Persist state for session恢复
- **Cycles**: Retry loops within the graph

### Core Concepts

```typescript
// Define state schema with Annotation
const StateAnnotation = Annotation.Root({
  userMessage: Annotation<string>({ reducer: (_, b) => b }),
  memoryState: Annotation<MemoryState>({ reducer: (_, b) => b }),
  generatedSQL: Annotation<string>({ reducer: (_, b) => b }),
  // ... more fields
});

// Build graph
const graph = new StateGraph(StateAnnotation)
  .addNode("node_name", nodeFunction)
  .addEdge(START, "first_node")
  .addEdge("node_a", "node_b")
  .addConditionalEdges("node_b", routingFunction, {
    path_a: "node_c",
    path_b: "node_d",
  });

// Compile with checkpointer for sessions
export const agent = graph.compile({ checkpointer: new MemorySaver() });
```

### Node Functions

Nodes are async functions that transform state:

```typescript
async function myNode(state: AgentState): Promise<Partial<AgentState>> {
  // Read from state
  const input = state.userMessage;
  
  // Process
  const result = await doSomething(input);
  
  // Return partial state updates
  return {
    outputField: result,
    anotherField: "value",
  };
}
```

### Conditional Routing

Route based on node output:

```typescript
function routeAfterNode(state: AgentState): string {
  if (state.riskLevel === "blocked") return "handle_blocked";
  if (state.hitlRequired) return "handle_hitl";
  return "execute_query";
}

// In graph:
.addConditionalEdges("check_guardrails", routeAfterGuardrails, {
  handle_blocked: "handle_blocked",
  handle_hitl: "handle_hitl",
  execute_query: "execute_query",
})
```

### Session Persistence

Use checkpointer to maintain state across requests:

```typescript
const checkpointer = new MemorySaver();
const agent = graph.compile({ checkpointer });

// Each session needs unique thread_id
const config = { configurable: { thread_id: sessionId } };
const result = await agent.invoke(initialState, config);

// Resume same session
const result2 = await agent.invoke({ /* new input */ }, config);
```

### When to Use LangGraph

- **Use LangGraph when**: You need branching, loops, complex state, or session memory
- **Use LangChain Chains when**: Simple linear pipelines (LLM → Parser → Output)

---

## 3. RAG Pipeline

### What is RAG?

**Retrieval-Augmented Generation** = Retrieve relevant context → Inject into LLM prompt → Generate response

### Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────┐
│   Schema    │───►│  Ingestion   │───►│ ChromaDB│
│  (SQLite)   │    │ (embeddocs)  │    │ (vector)│
└─────────────┘    └──────────────┘    └────┬────┘
                                            │
                                            ▼
┌─────────────┐    ┌──────────────┐    ┌─────────┐
│    LLM      │◄───│   Prompt     │◄───│Retrieve │
│  (generate) │    │ (context +)  │    │(semantic)│
└─────────────┘    └──────────────┘    └─────────┘
```

### Ingestion: Schema → Vector Store

```typescript
// 1. Get schema from database
const schemas = getSchema(); // returns table/column info

// 2. Create text chunks
const docs = schemas.map(table => `
  TABLE: ${table.name}
  Columns: ${table.columns.map(c => c.name + " " + c.type).join(", ")}
  Sample: ${JSON.stringify(table.sampleRows[0])}
`);

// 3. Embed chunks
const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
const vectors = await embeddings.embedDocuments(docs);

// 4. Store in vector DB
await collection.add({
  ids: ["table-1", "col-1", ...],
  embeddings: vectors,
  documents: docs,
  metadatas: [{ type: "table" }, { type: "column" }, ...],
});
```

### Retrieval: Question → Context

```typescript
// 1. Embed user question
const questionVector = await embeddings.embedQuery(question);

// 2. Find similar chunks (semantic search)
const results = await collection.query({
  queryEmbeddings: [questionVector],
  nResults: 6,  // top-k chunks
});

// 3. Format for prompt
const context = results.documents[0].join("\n\n---\n\n");
```

### Prompt Injection

```typescript
const systemPrompt = `
DATABASE SCHEMA (retrieved by RAG):
${schemaContext}

Only use tables and columns from the schema above.
`;
```

### Chunking Strategies

| Strategy | Use Case |
|----------|----------|
| **Table-level** | Full table context needed |
| **Column-level** | Precise column selection |
| **Hybrid** | Both table + column chunks (recommended) |

### Alternative Vector Stores

| Store | Pros | Cons |
|-------|------|------|
| **ChromaDB** | Simple, local, free | Limited scaling |
| **Pinecone** | Cloud, scalable | Paid, requires API key |
| **Weaviate** | Graph, flexible | More complex |
| **Qdrant** | Rust, fast | Good balance |
| **pgvector** | Use existing PostgreSQL | Requires Postgres |

---

## 4. Memory Architecture

### 3-Layer Memory System

```
┌─────────────────────────────────────────────────────┐
│                  LLM Prompt                         │
├─────────────────────────────────────────────────────┤
│  Layer 1: Short-term (in-memory, sliding window)  │
│  Layer 2: Summary (compressed old messages)        │
│  Layer 3: Long-term (ChromaDB, semantic search)   │
└─────────────────────────────────────────────────────┘
```

### Layer 1: Short-Term Memory

Keep last N messages in memory, inject into every prompt.

```typescript
const MAX_MESSAGES = 10;

function addMessage(state: MemoryState, message: Message): MemoryState {
  const updated = [...state.history, message];
  if (updated.length > MAX_MESSAGES) {
    return { ...state, history: updated.slice(-MAX_MESSAGES) };
  }
  return { ...state, history: updated };
}

function formatHistory(state: MemoryState): string {
  return state.history
    .slice(-6)  // last 3 turns
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");
}
```

**When to use**: Every conversation that needs context within a session.

### Layer 2: Summarization

When history gets too long, compress old messages into a summary.

```typescript
const llm = getLLM();

async function summarizeHistory(state: MemoryState): Promise<MemoryState> {
  const toSummarize = state.history.slice(0, -4);  // all except last 2
  const keepFresh = state.history.slice(-4);
  
  const transcript = toSummarize
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  
  const response = await llm.invoke([
    new HumanMessage(`Summarize this conversation in 3-4 sentences.
Focus on: what was the user trying to do, key results.
CONVERSATION:
${transcript}
SUMMARY:`)
  ]);
  
  return {
    history: keepFresh,
    summary: String(response.content).trim(),
  };
}
```

**When to use**: Long conversations approaching context window limits.

### Layer 3: Long-Term Memory

Store successful interactions in vector DB for retrieval across sessions.

```typescript
async function rememberQuery(question: string, sql: string): Promise<void> {
  const doc = `Question: ${question}\nSQL: ${sql}`;
  const vector = await embeddings.embedQuery(doc);
  
  await collection.add({
    ids: [uuid()],
    embeddings: [vector],
    documents: [doc],
    metadatas: [{ question, sql, timestamp: Date.now() }],
  });
}

async function recallSimilarQueries(question: string): Promise<string> {
  const vector = await embeddings.embedQuery(question);
  const results = await collection.query({
    queryEmbeddings: [vector],
    nResults: 3,
  });
  
  return results.documents[0]
    .map((doc, i) => `Example ${i + 1}:\n${doc}`)
    .join("\n\n");
}
```

**When to use**: Reuse successful patterns across different sessions/users.

### Alternative Memory Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Sliding Window** | Keep last N messages | Simple conversations |
| **Summarization** | Compress old messages | Long conversations |
| **Semantic Memory** | Vector store past interactions | Reuse across sessions |
| **Entity Memory** | Store facts about user/entities | Personalized responses |
| **Buffer + Summary** | Combined approach | Most use cases |

---

## 5. Guardrails & Safety

### Why Guardrails?

Prevent:
- **SQL injection** (malicious input)
- **Destructive operations** (DROP, DELETE)
- **Data leaks** (sensitive info in responses)
- **Unauthorized access** (cross-user data)

### Pattern-Based Guardrails

```typescript
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
];
```

### Mode-Based Policies

```typescript
type AppMode = "business" | "dev";

function checkGuardrails(sql: string, mode: AppMode) {
  // 1. Always block injection
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(sql)) {
      return { riskLevel: "blocked", reason: `Blocked: ${label}` };
    }
  }
  
  // 2. Destructive - block in business, HITL in dev
  for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sql)) {
      if (mode === "business") {
        return { riskLevel: "blocked", reason: `Blocked in business mode` };
      }
      return { riskLevel: "dangerous", requiresHITL: true };
    }
  }
  
  // 3. Write operations
  for (const pattern of WRITE_PATTERNS) { /* ... */ }
  
  return { riskLevel: "safe" };
}
```

### Schema Validation (Hallucination Check)

Verify generated SQL references only existing tables/columns:

```typescript
function validateSQL(sql: string, schemas: Schema[]): string[] {
  const errors: string[] = [];
  const tableNames = new Set(schemas.map(s => s.tableName.toLowerCase()));
  
  const refs = [...sql.matchAll(/(?:FROM|JOIN)\s+(\w+)/gi)]
    .map(m => m[1].toLowerCase());
  
  for (const ref of refs) {
    if (!tableNames.has(ref)) {
      errors.push(`Table "${ref}" does not exist`);
    }
  }
  
  return errors;
}
```

### Row Limits

Prevent massive result sets:

```typescript
function enforceLimit(sql: string): string {
  const max = parseInt(process.env.MAX_ROWS_RETURNED ?? "500");
  if (/^\s*SELECT/i.test(sql) && !/LIMIT/i.test(sql)) {
    return sql.replace(/;?\s*$/, "") + ` LIMIT ${max}`;
  }
  return sql;
}
```

### Alternative Approaches

| Approach | Description | Trade-off |
|----------|-------------|-----------|
| **Pattern Matching** | Regex rules | Fast, simple, but limited |
| **LLM-based** | Use LLM to judge safety | More accurate, slower |
| **SQL Parser** | Parse AST, validate | Most accurate, complex |
| **Static Analysis** | Type checking, bounds | Pre-execution safety |

---

## 6. Human-in-the-Loop (HITL)

### When to Use

Pause execution and require human approval for:
- Destructive operations (DELETE, DROP)
- Write operations (INSERT, UPDATE)
- Sensitive queries (PII access)
- High-cost operations

### Implementation Pattern

```typescript
// Graph node that triggers interrupt
async function checkGuardrailsNode(state: AgentState) {
  const { riskLevel, reason, requiresHITL } = checkGuardrails(
    state.generatedSQL,
    state.mode
  );
  
  if (riskLevel === "blocked") {
    return { riskLevel, guardReason: reason };
  }
  
  if (requiresHITL) {
    // This triggers the interrupt
    throw new Error(`TODO:interrupt:hitl:${JSON.stringify({
      sql: state.generatedSQL,
      riskLevel,
      userMessage: state.userMessage,
    })}`);
  }
  
  return { riskLevel, hitlRequired: false };
}
```

### Server-Side Handling

```typescript
// API endpoint checks for interrupt
const result = await agent.invoke(initialState, config);

// If interrupted
if (result.__interrupt__?.length) {
  const payload = result.__interrupt__[0].value;
  
  // Store for later, return to client
  hitlStore.create({ id: payload.hitlId, sql: payload.sql, ... });
  
  return res.json({ hitlRequired: true, hitlId: payload.hitlId });
}

// Resume after approval
app.post("/api/hitl/:id/approve", async (req, res) => {
  const result = await agent.invoke(
    new Command({ resume: true }),  // resume with approval
    config
  );
});
```

### Approval Flow

```
User Query
    │
    ▼
┌─────────────┐
│   Generate  │──── SQL generated
│     SQL     │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Guardrails│──── Dangerous?
└─────────────┘
    │
    ├───── Safe ───► Execute
    │
    ├───── Blocked ──► Reject
    │
    └───── HITL ──► ⏸️ PAUSE
                      │
                      ▼
              ┌─────────────┐
              │   Approve?  │
              └─────────────┘
                    │
            ┌───────┴───────┐
            │               │
         Approve         Reject
            │               │
            ▼               ▼
        Execute          Cancel
```

---

## 7. LLM Integration

### Ollama Setup

```typescript
import { ChatOllama } from "@langchain/ollama";

function getLLM() {
  return new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    temperature: 0.1,  // Lower = more deterministic
  });
}

// Use in prompts
const response = await llm.invoke([
  new SystemMessage(systemPrompt),
  new HumanMessage(userQuestion),
]);
```

### Switching Providers

**To OpenAI:**

```typescript
import { ChatOpenAI } from "@langchain/openai";

function getLLM() {
  return new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.1,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
```

**To Anthropic:**

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

function getLLM() {
  return new ChatAnthropic({
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.1,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });
}
```

### Output Parsing with Zod

Force structured output from LLM:

```typescript
import { z } from "zod";

const SQLOutput = z.object({
  sql: z.string().min(1),
  explanation: z.string(),
  riskLevel: z.enum(["safe", "moderate", "dangerous"]),
});

// In prompt, require JSON format
const systemPrompt = `
Respond ONLY with this exact JSON format:
{
  "sql": "SELECT ...",
  "explanation": "brief description",
  "riskLevel": "safe"
}
`;

// Parse response
const parsed = JSON.parse(rawResponse);
const validated = SQLOutput.parse(parsed);
```

### Fallback Parsing

Handle when LLM doesn't follow format:

```typescript
function parseSQLOutput(raw: string) {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    return SQLOutput.parse(JSON.parse(cleaned));
  } catch {
    // Fallback: extract SQL directly
    const match = raw.match(/SELECT[\s\S]+?;/i);
    if (match) {
      return { sql: match[0], explanation: "extracted", riskLevel: "safe" };
    }
    return null;
  }
}
```

### Temperature Guidelines

| Temperature | Use Case |
|-------------|----------|
| 0.0 - 0.2 | Code generation, SQL (deterministic) |
| 0.3 - 0.7 | General conversation |
| 0.8 - 1.0 | Creative tasks |

---

## 8. Database Operations

### SQLite with better-sqlite3

```typescript
import Database from "better-sqlite3";

const db = new Database("./data/app.db");
db.pragma("journal_mode = WAL");  // Better concurrency
db.pragma("foreign_keys = ON");   // Enforce FKs
```

### Query Execution

```typescript
function executeQuery(sql: string) {
  const isSelect = /^\s*(SELECT|WITH|EXPLAIN)/i.test(sql.trim());
  
  if (isSelect) {
    const rows = db.prepare(sql).all();
    return { rows, rowCount: rows.length };
  } else {
    const info = db.prepare(sql).run();
    return { rows: [{ changes: info.changes }], rowCount: 1 };
  }
}
```

### Schema Introspection

```typescript
function getSchema() {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table'
  `).all() as { name: string }[];
  
  return tables.map(table => {
    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
    const fks = db.prepare(`PRAGMA foreign_key_list(${table.name})`).all();
    const sample = db.prepare(`SELECT * FROM ${table.name} LIMIT 2`).all();
    
    return {
      tableName: table.name,
      columns: columns.map(c => ({
        name: c.name,
        type: c.type,
        primaryKey: c.pk === 1,
        foreignKey: fks.find(f => f.from === c.name),
      })),
      sampleRows: sample,
    };
  });
}
```

### Alternative ORMs

| ORM | Pros | Cons |
|-----|------|------|
| **better-sqlite3** | Fast, simple, sync | Basic type safety |
| **Drizzle** | Type-safe, lightweight | Newer, smaller community |
| **Prisma** | Full-featured, great DX | Heavy, slower cold starts |
| **Kysely** | Type-safe, flexible | Query builder only |

---

## 9. Observability

### Custom Trace System

```typescript
interface Trace {
  id: string;
  span: (name: string, input?: unknown) => Span;
  score: (name: string, value: number) => void;
  end: (output?: unknown) => void;
}

function createTrace(sessionId: string, input: string): Trace {
  const traceId = `trace-${Date.now()}`;
  
  return {
    id: traceId,
    span: (name, input) => {
      console.log(`[span] ${name} start`);
      return {
        end: (output) => {
          console.log(`[span] ${name} end`);
        }
      };
    },
    score: (name, value) => {
      console.log(`[score] ${name}: ${value}`);
    },
    end: (output) => {
      console.log(`[trace] ${traceId} complete`);
    }
  };
}
```

### Use in Graph Nodes

```typescript
async function myNode(state: AgentState) {
  const span = state.trace?.span("my_node", { input: state.userMessage });
  
  const result = await process(state.userMessage);
  
  span?.end({ result: result.length });
  
  return { output: result };
}
```

### Scoring Metrics (RAGAS-like)

```typescript
// Context Precision: Did we retrieve relevant schema?
function scoreContextPrecision(retrievedContext: string, sql: string): number {
  const sqlTokens = new Set(sql.toLowerCase().match(/\b\w+\b/g) ?? []);
  const contextTokens = new Set(retrievedContext.toLowerCase().match(/\b\w+\b/g) ?? []);
  const overlap = [...sqlTokens].filter(t => contextTokens.has(t)).length;
  return Math.min(1, overlap / sqlTokens.size);
}

// Faithfulness: Is response grounded in data?
function scoreFaithfulness(response: string, rows: any[]): number {
  if (rows.length === 0) return 1;
  const rowText = JSON.stringify(rows).toLowerCase();
  const words = response.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const grounded = words.filter(w => rowText.includes(w));
  return Math.min(1, grounded.length / words.length);
}
```

### Alternative Solutions

| Tool | Description | Trade-off |
|------|-------------|-----------|
| **Custom** | Roll your own | Full control, more work |
| **Langfuse** | LangChain-native tracing | Great integration, managed |
| **LangSmith** | OpenAI's platform | Good for OpenAI, pricey |
| **OpenTelemetry** | Industry standard | Complex setup |
| **Datadog/Grafana** | Enterprise observability | Full-featured, expensive |

---

## 10. How-To Guides

### How to Add a New Graph Node

1. **Create node function** in `src/graph/nodes/`:

```typescript
// src/graph/nodes/my-new-node.ts
import type { AgentState } from "../../types/agentState.js";

export async function myNewNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log("[Node] my_new_node");
  
  // Read from state
  const input = state.userMessage;
  
  // Process
  const result = await doSomething(input);
  
  // Return updates
  return {
    newField: result,
  };
}
```

2. **Register in graph** (`src/graph/agent.ts`):

```typescript
import { myNewNode } from "./nodes/my-new-node.js";

const graph = new StateGraph(StateAnnotation)
  .addNode("my_new_node", myNewNode)
  .addEdge("previous_node", "my_new_node")
  .addEdge("my_new_node", "next_node");
```

### How to Add a New Guardrail

1. **Add pattern** in `src/guardrails/sqlGuard.ts`:

```typescript
const NEW_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
  // Add more patterns
];
```

2. **Add logic** in `checkGuardrails` function:

```typescript
for (const { pattern, label } of NEW_PATTERNS) {
  if (pattern.test(sql)) {
    return {
      riskLevel: "blocked",
      reason: `Blocked: ${label}`,
      requiresHITL: false,
    };
  }
}
```

### How to Switch LLM Provider

1. **Install new package**:
```bash
npm install @langchain/openai
# or
npm install @langchain/anthropic
```

2. **Update LLM factory** (`src/llm/llm.ts`):

```typescript
import { ChatOpenAI } from "@langchain/openai";

export function getLLM() {
  return new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.1,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
```

3. **Update embeddings** if needed:

```typescript
import { OpenAIEmbeddings } from "@langchain/openai";

export function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
  });
}
```

### How to Add Session Persistence

1. **Use checkpointer** in graph compilation:

```typescript
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
const agent = graph.compile({ checkpointer });
```

2. **Maintain thread_id per session**:

```typescript
const config = { configurable: { thread_id: sessionId } };
const result = await agent.invoke(initialState, config);
```

3. **Store in server** (`src/server/index.ts`):

```typescript
const sessions = new Map<string, { memoryState: MemoryState, threadId: string }>();

function getSession(sessionId: string) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      memoryState: { history: [] },
      threadId: sessionId,
    });
  }
  return sessions.get(sessionId)!;
}
```

### How to Add Evaluation Metrics

1. **Create metrics** in `src/Ragas/eval.ts`:

```typescript
export function scoreContextPrecision(
  retrievedContext: string,
  generatedOutput: string
): number {
  // Implementation
}

export function scoreFaithfulness(
  response: string,
  retrievedContext: string
): number {
  // Implementation
}
```

2. **Integrate in summarize results node**:

```typescript
async function summarizeResultsNode(state: AgentState) {
  const precision = scoreContextPrecision(state.schemaContext, state.generatedSQL);
  const faithfulness = scoreFaithfulness(state.finalResponse, state.queryResult?.rows);
  
  // Log or store scores
  state.trace?.score("context_precision", precision);
  state.trace?.score("faithfulness", faithfulness);
  
  return { /* ... */ };
}
```

### How to Add a New API Endpoint

1. **Define route** in `src/server/index.ts`:

```typescript
app.get("/api/your-endpoint", async (req, res) => {
  try {
    const result = await doSomething();
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

2. **Add type definitions** if needed:

```typescript
interface YourEndpointResponse {
  result: string;
  metadata?: Record<string, unknown>;
}
```

### How to Configure Environment

1. **Create `.env` file**:

```bash
# LLM
OLLAMA_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Database
DB_PATH=./data/app.db
MAX_ROWS_RETURNED=500

# Server
PORT=3001
DEFAULT_MODE=business
MAX_QUERY_RETRIES=3

# Observability
TRACING_ENABLED=true
LOG_FORMAT=human  # or json
```

2. **Load in code**:

```typescript
import "dotenv/config";

const value = process.env.YOUR_VAR ?? "default";
```

---

## 11. Alternatives & Trade-offs

### LangGraph vs LangChain

| Aspect | LangGraph | LangChain |
|--------|-----------|-----------|
| **Complexity** | Higher (graph, nodes) | Lower (chains) |
| **Flexibility** | Very high | Moderate |
| **State Management** | Built-in | Manual |
| **Loops/Cycles** | Supported | Limited |
| **Session Memory** | Checkpointer | Custom |

**Recommendation**: Use LangGraph for complex agents; LangChain for simple pipelines.

### Vector Store Options

| Store | Setup | Scaling | Cost | Best For |
|-------|-------|---------|------|----------|
| **ChromaDB** | Local | Single-machine | Free | Prototyping, small apps |
| **Pinecone** | Cloud | Managed | Paid | Production, scale |
| **Weaviate** | Both | Scalable | Open/Paid | Graph features needed |
| **Qdrant** | Both | Fast | Open/Paid | Performance |
| **pgvector** | Existing DB | PostgreSQL | Open | Already using Postgres |

### LLM Providers

| Provider | Model | Strengths | Weaknesses |
|----------|-------|-----------|------------|
| **Ollama** | Llama, Mistral | Local, private, free | Limited models, slower |
| **OpenAI** | GPT-4o, GPT-4o-mini | Best overall | Cost, no local |
| **Anthropic** | Claude 3.5 | Best reasoning | Cost, no local |
| **Google** | Gemini | Large context | Quality varies |
| **Mistral** | Mixtral | Good性价比 | Smaller ecosystem |

### Database Options

| DB | Use Case | Trade-off |
|----|----------|-----------|
| **SQLite** | Prototyping, small | No concurrent writes |
| **PostgreSQL** | Production | More complex setup |
| **MySQL** | Web apps | Less JSON friendly |

### Validation Libraries

| Library | Pros | Cons |
|---------|------|------|
| **Zod** | Type-safe, popular | Runtime only |
| **Yup** | Schema validation | Less TypeScript-friendly |
| **Arktype** | Fast, modern | Newer |
| **JSON Schema** | Standard | Verbose |

---

## Quick Reference

### Common Patterns

**Prompt with context injection:**
```typescript
const prompt = `
CONTEXT:
${retrievedContext}

QUESTION:
${userQuestion}

Answer based only on the context above.
`;
```

**Retry with error feedback:**
```typescript
const retryContext = state.executionError
  ? `Previous attempt failed: ${state.executionError}\nFix the error.`
  : "";

const response = await llm.invoke([/* ... */]);
```

**Conditional based on mode:**
```typescript
if (mode === "business") {
  // Strict rules
} else {
  // Dev-friendly, allow more
}
```

### Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| **Context window exceeded** | Too much history | Add summarization |
| **Hallucinated table names** | LLM making up schema | Add validation, better RAG |
| **Slow queries** | No row limits | Add LIMIT enforcement |
| **ChromaDB connection failed** | Port 8000 not running | Start ChromaDB |
| **Ollama not responding** | Model not loaded | Pull model, check port |

---

## Contributing to This Guide

When adding new patterns to your project:

1. **Document the pattern** - What problem does it solve?
2. **Show code example** - Minimal, working snippet
3. **Note alternatives** - What other options exist?
4. **Update table of contents** - Keep it navigable

---

> Last updated: 2025
> Based on: SQL RAG Engine (production implementation)
