import { buildBriefMarkdown } from '../lib/context/brief.js';

describe('Context Brief', () => {
  test('renders a compact repository brief from project metadata', () => {
    const markdown = buildBriefMarkdown({
      name: 'fixture-app',
      packageManager: 'npm',
      moduleType: 'module',
      scripts: {
        test: 'jest',
        build: 'vite build'
      },
      languages: ['javascript', 'markdown'],
      keyFiles: ['package.json', 'README.md'],
      fileCount: 8,
      hasTests: true,
      warnings: ['Invalid package.json: trailing comma']
    });

    expect(markdown).toContain('# repo2ctx Brief');
    expect(markdown).toContain('Prepare safe, task-focused repository context for AI coding agents');
    expect(markdown).toContain('- Package manager: npm');
    expect(markdown).toContain('- test: `jest`');
    expect(markdown).toContain('- javascript');
    expect(markdown).toContain('## Health');
    expect(markdown).toContain('- Invalid package.json: trailing comma');
  });
});
