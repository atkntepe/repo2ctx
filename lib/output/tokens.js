export function estimateTokens(content) {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export function formatTokenEstimate(content) {
  return `~${estimateTokens(content).toLocaleString()} tokens / ${content.length.toLocaleString()} chars`;
}
