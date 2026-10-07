// Token accounting. Approximate — an LLM's real cost is prompt+completion
// tokens, and we model it as tokens consumed reading context and writing
// comments. The point is the ratio, not the absolute bill.

export const TOKENS_PER_COMMENT = 60;

export function tokensForFile(path, addedLines) {
  return addedLines.reduce((sum, l) => sum + Math.ceil(l.s.length / 4), 0);
}

export function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}