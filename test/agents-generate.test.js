import { buildAgentsMarkdown, buildClaudeMarkdown } from '../lib/agents/generate.js';

describe('Agent Docs Generation', () => {
  test('buildAgentsMarkdown includes project metadata and detected test command', () => {
    const markdown = buildAgentsMarkdown({
      name: 'fixture-app',
      packageManager: 'npm',
      moduleType: 'module',
      scripts: {
        test: 'jest'
      },
      languages: ['javascript'],
      keyFiles: ['package.json', 'README.md'],
      fileCount: 12,
      hasTests: true,
      warnings: []
    });

    expect(markdown).toContain('# AGENTS.md');
    expect(markdown).toContain('fixture-app');
    expect(markdown).toContain('Test command: `npm test` (`jest`).');
    expect(markdown).not.toContain('TODO');
    expect(markdown).not.toContain('placeholder');
  });

  test('buildClaudeMarkdown delegates to AGENTS.md', () => {
    expect(buildClaudeMarkdown()).toContain('@AGENTS.md');
  });
});
