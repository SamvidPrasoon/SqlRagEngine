import "dotenv/config";
import { getDB, getSchema, schemaToText } from "../../src/db/adapter.js";

const db = getDB();

// Check row counts
const tables = ["customers", "products", "orders", "order_items", "campaigns"];
console.log("\n📊 Row counts:");
for (const t of tables) {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get() as {
    count: number;
  };
  console.log(`  ${t}: ${row.count} rows`);
}

// Check a real query
console.log("\n🏆 Top 3 customers by lifetime value:");
const top = db
  .prepare(
    `
  SELECT name, tier, lifetime_value 
  FROM customers 
  ORDER BY lifetime_value DESC 
  LIMIT 3
`,
  )
  .all();
console.log(top);

// Check what schema looks like as text (what the LLM will see)
console.log("\n📋 Schema text (LLM will see this):");
const schema = getSchema();
console.log(schemaToText(schema));
