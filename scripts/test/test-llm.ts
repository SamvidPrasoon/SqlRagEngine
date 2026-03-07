import "dotenv/config";
import { askDatabase } from "../../src/llm/llm.js";

const question =
  process.argv[2] ?? "Who are the top 5 customers by lifetime value?";

console.log(`\n❓ Question: ${question}`);
await askDatabase(question);
