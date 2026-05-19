import { redactContent, redactFileContent } from '../lib/output/redact.js';

describe('output redaction', () => {
  test('redacts common secret assignments', () => {
    const input = [
      'OPENAI_API_KEY=sk-proj-1234567890abcdef',
      'ANTHROPIC_API_KEY=sk-ant-api03-abcdef',
      'normal=value'
    ].join('\n');

    const output = redactContent(input);

    expect(output).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(output).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(output).toContain('normal=value');
    expect(output).not.toContain('sk-proj-1234567890abcdef');
  });

  test('redacts dotenv files by path with a clear marker', () => {
    const output = redactFileContent('.env.local', 'DATABASE_URL=postgres://user:pass@example/db');

    expect(output).toBe('[REDACTED: dotenv file]');
  });
});
