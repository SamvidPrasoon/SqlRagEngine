export function scoreContextPrecision(
  retrievedContext: string,
  sql: string,
): number {
  const sqlTokens = new Set(sql.toLowerCase().match(/\b[a-z_]{3,}\b/g) ?? []);
  const contextTokens = new Set(
    retrievedContext.toLowerCase().match(/\b[a-z_]{3,}\b/g) ?? [],
  );

  const overlap = [...sqlTokens].filter((t) => contextTokens.has(t)).length;
  return Math.min(1, overlap / Math.max(sqlTokens.size, 1));
}
// Faithfulness: is the response grounded in actual results?
export function scoreFaithfulness(
  response: string,
  rows: Record<string, unknown>[],
): number {
  if (rows.length === 0) return 1.0;
  const rowText = JSON.stringify(rows).toLowerCase();
  const responseWords = response.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const grounded = responseWords.filter((w) => rowText.includes(w));
  return Math.min(1, grounded.length / Math.max(responseWords.length, 1));
}
