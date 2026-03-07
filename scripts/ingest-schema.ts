import "dotenv/config";
import { ingestSchema } from "../src/rag/ingestion.js";

console.log("Starting schema ingestion...");
await ingestSchema();
console.log("Done! RAG is ready.");
