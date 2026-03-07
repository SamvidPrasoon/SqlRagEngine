// Problem 1: LLM has no memory between calls
//   → Short-term memory: inject conversation history into every prompt

// Problem 2: History grows too long, hits context limit
//   → Summarization: compress old turns into one paragraph

// Problem 3: Good queries are lost when session ends
//   → Long-term memory: store successful queries in ChromaDB forever

import "dotenv/config";
import { OllamaEmbeddings } from "@langchain/ollama";
import { ChromaClient } from "chromadb";
import { v4 as uuid } from "uuid";
import { getLLM } from "../llm/llm.js";
import { getChroma, getEmbeddings } from "../rag/ingestion.js";


export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface MemoryState {
  history: Message[];
  summary?: string; // compressed version of old messages
}


const MAX_MESSAGES = 10; // keep last 10 messages fresh
const MEMORY_COLLECTION = "sqlmind_memory";

// LAYER 1: SHORT-TERM MEMORY

export function addMessage(state: MemoryState, message: Message): MemoryState {
  const updated = [...state.history, message];

  // Sliding window — keep only last MAX_MESSAGES
  if (updated.length > MAX_MESSAGES) {
    return {
      ...state,
      history: updated.slice(-MAX_MESSAGES),
    };
  }

  return { ...state, history: updated };
}

// Format history as text to inject into prompts
export function formatHistory(state: MemoryState): string {
  const parts: string[] = [];

  // If we have a summary of old messages, include it first
  if (state.summary) {
    parts.push(`# Previous Conversation Summary\n${state.summary}`);
  }

  // Then include recent raw messages
  if (state.history.length > 0) {
    const recent = state.history
      .slice(-6) // last 3 turns (user + assistant each)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    parts.push(`# Recent Messages\n${recent}`);
  }

  return parts.join("\n\n");
}

export function shouldSummarize(state: MemoryState): boolean {
  return state.history.length >= MAX_MESSAGES;
}

// LAYER 2: SUMMARIZATION

export async function summarizeHistory(
  state: MemoryState,
): Promise<MemoryState> {
  if (!shouldSummarize(state)) return state;

  const llm = getLLM();

  // Take everything except the last 4 messages
  const toSummarize = state.history.slice(0, -4);
  const keepFresh = state.history.slice(-4);

  const transcript = toSummarize
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  console.log("📝 Summarizing old conversation turns...");

  const response = await llm.invoke([
    {
      role: "user",
      content: `Summarize this database conversation in 3-4 sentences.
Focus on: what tables were queried, what the user was trying to find, key results.

CONVERSATION:
${transcript}

SUMMARY:`,
    },
  ]);

  const newSummary = String(response.content).trim();
  console.log("📋 Summary:", newSummary);

  return {
    history: keepFresh, // only keep last 4 messages fresh
    summary: newSummary, // everything else compressed here
  };
}

// LAYER 3: LONG-TERM MEMORY

// Call this after every successful query
export async function rememberQuery(
  question: string,
  sql: string,
  sessionId: string,
): Promise<void> {
  try {
    const chroma = getChroma();
    const embeddings = getEmbeddings();

    const collection = await chroma.getOrCreateCollection({
      name: MEMORY_COLLECTION,
      embeddingFunction: null as any,
    });

    // The document we store is the question + working SQL pair
    const doc = `Question: ${question}\nSQL: ${sql}`;
    const vector = await embeddings.embedQuery(doc);

    await collection.add({
      ids: [uuid()],
      embeddings: [vector],
      documents: [doc],
      metadatas: [
        {
          question,
          sql,
          sessionId,
          timestamp: Date.now(),
        },
      ],
    });

    console.log("💾 Query saved to long-term memory");
  } catch (e) {
    // Never crash the app because memory failed
    console.warn(
      "⚠️  Could not save to long-term memory:",
      (e as Error).message,
    );
  }
}

// Call this at the start of each query to get relevant examples
export async function recallSimilarQueries(question: string): Promise<string> {
  try {
    const chroma = getChroma();
    const embeddings = getEmbeddings();

    const collection = await chroma.getOrCreateCollection({
      name: MEMORY_COLLECTION,
      embeddingFunction: null as any,
    });

    const vector = await embeddings.embedQuery(question);
    const results = await collection.query({
      queryEmbeddings: [vector],
      nResults: 3,
    });

    if (!results.documents?.[0]?.length) return "";

    const examples = results.documents[0]
      .filter(Boolean)
      .map((doc, i) => `Example ${i + 1}:\n${doc}`)
      .join("\n\n");

    return `# Similar Past Queries\n${examples}`;
  } catch (e) {
    return ""; //memory is enhancement, not requirement
  }
}
