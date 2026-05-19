import { promises as fs } from 'fs';
import path from 'path';
import { buildAgentsMarkdown, buildClaudeMarkdown, writeAgentDocs } from '../lib/agents/generate.js';

const originalCwd = process.cwd();
const testDir = path.join(originalCwd, 'test-temp-agents-generate');

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

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

  test('writeAgentDocs refuses to overwrite existing AGENTS.md without force', async () => {
    await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'existing agents\n', 'utf8');

    await expect(writeAgentDocs(testDir, {
      agents: 'new agents\n',
      claude: 'new claude\n'
    })).rejects.toThrow('AGENTS.md already exists');

    await expect(fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf8')).resolves.toBe('existing agents\n');
  });

  test('writeAgentDocs refuses to partially write when CLAUDE.md exists without force', async () => {
    await fs.writeFile(path.join(testDir, 'CLAUDE.md'), 'existing claude\n', 'utf8');

    await expect(writeAgentDocs(testDir, {
      agents: 'new agents\n',
      claude: 'new claude\n'
    }, {
      claude: true
    })).rejects.toThrow('CLAUDE.md already exists');

    await expect(fs.readFile(path.join(testDir, 'CLAUDE.md'), 'utf8')).resolves.toBe('existing claude\n');
    await expect(fs.access(path.join(testDir, 'AGENTS.md'))).rejects.toThrow();
  });

  test('writeAgentDocs overwrites existing files with force', async () => {
    await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'existing agents\n', 'utf8');
    await fs.writeFile(path.join(testDir, 'CLAUDE.md'), 'existing claude\n', 'utf8');

    await writeAgentDocs(testDir, {
      agents: 'new agents\n',
      claude: 'new claude\n'
    }, {
      claude: true,
      force: true
    });

    await expect(fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf8')).resolves.toBe('new agents\n');
    await expect(fs.readFile(path.join(testDir, 'CLAUDE.md'), 'utf8')).resolves.toBe('new claude\n');
  });
});
