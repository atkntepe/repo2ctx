import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { generateFileTree, generateText, getLanguageFromExtension } from '../lib/generate.js';
import { renderSection } from '../lib/output/renderers.js';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Generate Module', () => {
  test('generates a stable tree for nested files', () => {
    const tree = generateFileTree([
      'package.json',
      'src/index.js',
      'src/utils/format.js'
    ]);

    expect(tree).toContain('Project Structure:');
    expect(tree).toContain('package.json');
    expect(tree).toContain('src');
    expect(tree).toContain('index.js');
    expect(tree).toContain('format.js');
  });

  test('detects markdown code block languages by extension', () => {
    expect(getLanguageFromExtension('app.js')).toBe('javascript');
    expect(getLanguageFromExtension('types.ts')).toBe('typescript');
    expect(getLanguageFromExtension('README.md')).toBe('markdown');
    expect(getLanguageFromExtension('unknown.custom')).toBe('');
  });

  test('renders XML sections with escaped content', () => {
    const output = renderSection('file', 'a < b', { format: 'xml', attributes: { path: 'src/a.js' } });

    expect(output).toBe('<file path="src/a.js">a &lt; b</file>\n');
  });

  test('generates parseable JSON output for structured format', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dir2txt-json-'));
    const filePath = path.join(tempDir, 'example.js');
    const outputFile = path.join(tempDir, 'out.json');

    try {
      await fs.writeFile(filePath, 'const value = 1;\n', 'utf8');
      await generateText([filePath], { format: 'json', outputFile });

      const document = JSON.parse(await fs.readFile(outputFile, 'utf8'));
      expect(document.tree).toContain('example.js');
      expect(document.files).toEqual([
        { path: filePath, content: 'const value = 1;\n', skipped: false }
      ]);
      expect(document.summary).toMatchObject({
        totalFiles: 1,
        processed: 1,
        skipped: 0
      });
      expect(document.summary.estimatedSize).toContain('tokens');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('generates valid XML output for structured format', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dir2txt-xml-'));
    const filePath = path.join(tempDir, 'example.js');
    const outputFile = path.join(tempDir, 'out.xml');

    try {
      await fs.writeFile(filePath, 'a < b && c > d\n', 'utf8');
      await generateText([filePath], { format: 'xml', outputFile });

      const output = await fs.readFile(outputFile, 'utf8');
      expect(output.startsWith('<repo2ctx>\n')).toBe(true);
      expect(output).toContain('<files>');
      expect(output).toContain(`path="${filePath}"`);
      expect(output).toContain('a &lt; b &amp;&amp; c &gt; d');
      expect(output).toContain('<summary totalFiles="1" processed="1" skipped="0"');
      expect(output.endsWith('</repo2ctx>\n')).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
