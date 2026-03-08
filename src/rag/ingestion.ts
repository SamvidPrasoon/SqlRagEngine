import "dotenv/config";
import { OllamaEmbeddings } from "@langchain/ollama";
import { ChromaClient } from "chromadb";
import { getSchema, schemaToText } from "../db/adapter.js";

//collection
export const COLLECTION = "sqlmind_schema";

//get  embedding model
export function getEmbeddings() {
  return new OllamaEmbeddings({
    model: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
}
// get chroma db client
export function getChroma() {
  return new ChromaClient({
    host: "localhost",
    port: 8000,
    
  });
}

export const ingestSchema = async () => {
  console.log("📥 Ingesting schema into ChromaDB...");
  // get schema and embedder and chroma
  const chroma = getChroma();
  const embeddings = getEmbeddings();
  const schemas = getSchema();

  // check old collection if exist delete and create new
  try {
    await chroma.deleteCollection({
      name: COLLECTION,
    });
  } catch (error) {}

  //create new
  const collection = await chroma.createCollection({
    name: COLLECTION,
    embeddingFunction: null as any,
  });
  const docs: string[] = [];
  const ids: string[] = [];
  const metas: { tableName: string; type: string }[] = [];
  // CREATE CHUNKS
  for (const table of schemas) {
    // Full table description
    const cols = table.columns
      .map(
        (c) =>
          `  ${c.name} (${c.type})${c.primaryKey ? " PK" : ""}${c.foreignKey ? ` → ${c.foreignKey.table}` : ""}`,
      )
      .join("\n");

    const sample = table.sampleRows.length
      ? `\nExample row: ${JSON.stringify(table.sampleRows[0])}`
      : "";

    const doc = `TABLE: ${table.tableName}\nColumns:\n${cols}\nSampleData:${sample}`;

    docs.push(doc);
    ids.push(`table-${table.tableName}`);
    metas.push({ tableName: table.tableName, type: "table" });

    // one chunk per column (for precise column-level retrieval)
    for (const col of table.columns) {
      docs.push(
        `Table ${table.tableName} has column ${col.name} of type ${col.type}${col.foreignKey ? `, references ${col.foreignKey.table}` : ""}`,
      );
      ids.push(`col-${table.tableName}-${col.name}`);
      metas.push({ tableName: table.tableName, type: "column" });
    }
  }
  // EMBEDDING Chunks
  console.log(`Embedding ${docs.length} chunks...`);
  const vectors = await embeddings.embedDocuments(docs);
  // Store in ChromaDB
  await collection.add({
    ids,
    embeddings: vectors,
    documents: docs,
    metadatas: metas,
  });
  console.log(
    `✅ Ingested ${docs.length} chunks from ${schemas.length} tables`,
  );
};
// At query time — find most relevant schema chunks
export async function retrieveSchema(question: string): Promise<string> {
  try {
    const chroma = getChroma();
    const embeddings = getEmbeddings();
    const collection = await chroma.getOrCreateCollection({
      name: COLLECTION,
      embeddingFunction: null as any,
    });

    // Convert question to vector
    const questionVector = await embeddings.embedQuery(question);

    // Find 6 most similar chunks by vector distance
    const results = await collection.query({
      queryEmbeddings: [questionVector],
      nResults: 6,
    });

    if (!results.documents?.[0]?.length) {
      // Fallback: return full schema if ChromaDB empty
      return schemaToText(getSchema());
    }

    const chunks = results.documents[0].filter(Boolean).join("\n\n---\n\n");
    return `# Relevant Schema (retrieved by RAG)\n\n${chunks}`;
  } catch (e) {
    // ChromaDB down — graceful fallback
    console.warn("⚠️  ChromaDB unavailable, using full schema");
    return schemaToText(getSchema());
  }
}

