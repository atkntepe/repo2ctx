import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { generateFileTree, generateText, getLanguageFromExtension } from '../lib/generate.js';
import { renderSection } from '../lib/output/renderers.js';

let consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
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

  test('keeps direct structured stdout parseable during dry generation', async () => {
    consoleSpy.mockRestore();
    let stdout = '';

    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk, encoding, callback) => {
      stdout += chunk.toString();
      if (typeof encoding === 'function') encoding();
      if (typeof callback === 'function') callback();
      return true;
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk, encoding, callback) => {
      if (typeof encoding === 'function') encoding();
      if (typeof callback === 'function') callback();
      return true;
    });

    try {
      await generateText(['src/index.js'], { format: 'json', dry: true });

      const document = JSON.parse(stdout);
      expect(document.tree).toContain('src');
      expect(document.files).toEqual([]);
      expect(document.summary).toMatchObject({
        totalFiles: 1,
        processed: 0,
        skipped: 0
      });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    }
  });

  test('includes relationship and analysis metadata in structured JSON output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dir2txt-json-meta-'));
    const filePath = path.join(tempDir, 'example.js');
    const outputFile = path.join(tempDir, 'out.json');
    const projectAnalysis = {
      stats: {
        analyzedFiles: 1,
        totalImports: 1,
        totalExports: 1
      },
      relationships: new Map([
        [filePath, {
          summary: 'Example module',
          imports: [{ path: './dep.js' }],
          exports: [{ name: 'value' }]
        }]
      ]),
      dependencyGraph: new Map([
        [filePath, {
          dependencies: ['dep.js'],
          dependents: ['consumer.js']
        }]
      ])
    };

    try {
      await fs.writeFile(filePath, 'export const value = 1;\n', 'utf8');
      await generateText([filePath], {
        format: 'json',
        outputFile,
        projectAnalysis,
        fileSummaries: true,
        includeRelationships: true,
        includeDependencies: true
      });

      const document = JSON.parse(await fs.readFile(outputFile, 'utf8'));
      expect(document.projectAnalysis).toEqual({
        totalFilesAnalyzed: 1,
        totalImports: 1,
        totalExports: 1
      });
      expect(document.dependencyGraph).toContain('example.js');
      expect(document.files[0].relationships).toEqual({
        summary: 'Example module',
        imports: ['./dep.js'],
        exports: ['value'],
        dependencies: ['dep.js'],
        dependents: ['consumer.js']
      });
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
