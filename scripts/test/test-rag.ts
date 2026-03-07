import "dotenv/config";
import { retrieveSchema } from "../../src/rag/ingestion.js";

const questions = [
  "who are the top customers by spending?",
  "which products are low on stock?",
  "what campaigns are running?",
];

for (const q of questions) {
  console.log(`\n❓ "${q}"`);
  const context = await retrieveSchema(q);
  console.log(context);
  console.log("─".repeat(50));
}
