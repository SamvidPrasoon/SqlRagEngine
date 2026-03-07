import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH ?? "./data/sqlmind.db";

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

export function executeQuery(sql: string) {
  const db = getDB();
  const start = Date.now();
  const trimmed = sql.trim();
  const isSelect = /^\s*(SELECT|WITH|EXPLAIN)/i.test(trimmed);

  let rows: Record<string, unknown>[];

  if (isSelect) {
    rows = db.prepare(trimmed).all() as Record<string, unknown>[];
  } else {
    const info = db.prepare(trimmed).run();
    rows = [
      { changes: info.changes, message: `${info.changes} row(s) affected.` },
    ];
  }

  const max = parseInt(process.env.MAX_ROWS_RETURNED ?? "500");
  return {
    rows: rows.slice(0, max),
    rowCount: rows.length,
    executionTimeMs: Date.now() - start,
    sql: trimmed,
  };
}

// Get the schema of the database for the LLM to use
export function getSchema() {
  const db = getDB();

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as { name: string }[];

  return tables.map((t) => {
    const columns = db.prepare(`PRAGMA table_info(${t.name})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];

    const fks = db.prepare(`PRAGMA foreign_key_list(${t.name})`).all() as {
      from: string;
      table: string;
      to: string;
    }[];

    const fkMap = new Map(
      fks.map((f) => [f.from, { table: f.table, column: f.to }]),
    );

    let sampleRows: Record<string, unknown>[] = [];
    try {
      sampleRows = db
        .prepare(`SELECT * FROM ${t.name} LIMIT 2`)
        .all() as Record<string, unknown>[];
    } catch (_) {}

    return {
      tableName: t.name,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.notnull === 0,
        primaryKey: c.pk === 1,
        foreignKey: fkMap.get(c.name),
      })),
      sampleRows,
    };
  });
}

// Convert the schema to a text representation for the LLM
export function schemaToText(schemas: ReturnType<typeof getSchema>): string {
  return schemas
    .map((t) => {
      const cols = t.columns
        .map(
          (c) =>
            `  - ${c.name} (${c.type})${c.primaryKey ? " PK" : ""}${c.foreignKey ? ` → ${c.foreignKey.table}.${c.foreignKey.column}` : ""}`,
        )
        .join("\n");

      const sample = t.sampleRows.length
        ? `\n  Example: ${JSON.stringify(t.sampleRows[0])}`
        : "";

      return `TABLE: ${t.tableName}\n${cols}${sample}`;
    })
    .join("\n\n");
}

// Validate the SQL query against the schema to ensure it is valid and safe
export function validateSQL(
  sql: string,
  schemas: ReturnType<typeof getSchema>,
): string[] {
  const errors: string[] = [];
  const tableNames = new Set(schemas.map((s) => s.tableName.toLowerCase()));

  const refs = [...sql.matchAll(/(?:FROM|JOIN)\s+([`"']?(\w+)[`"']?)/gi)].map(
    (m) => m[2].toLowerCase(),
  );

  for (const ref of refs) {
    if (!tableNames.has(ref)) {
      errors.push(`Table "${ref}" does not exist.`);
    }
  }
  return errors;
}
