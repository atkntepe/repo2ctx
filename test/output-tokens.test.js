import { estimateTokens, formatTokenEstimate } from '../lib/output/tokens.js';

describe('token estimation', () => {
  test('estimates tokens using a conservative character ratio', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(401))).toBe(101);
  });

  test('formats token estimate with characters', () => {
    expect(formatTokenEstimate('hello world')).toBe('~3 tokens / 11 chars');
  });
});
