import { promises as fs } from 'fs';
import path from 'path';
import { buildMap, buildMapMarkdown, classifyFileRole } from '../lib/context/map.js';

const testDir = path.join(process.cwd(), 'test-temp-context-map');

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Context Map', () => {
  test('classifies common repository file roles', () => {
    expect(classifyFileRole('package.json')).toBe('config');
    expect(classifyFileRole('README.md')).toBe('docs');
    expect(classifyFileRole('test/app.test.js')).toBe('tests');
    expect(classifyFileRole('lib/app.js')).toBe('source');
  });

  test('renders a compact repository map grouped by role', () => {
    const markdown = buildMapMarkdown([
      'lib/app.js',
      'test/app.test.js',
      'package.json',
      'README.md'
    ]);

    expect(markdown).toContain('# Repository Map');
    expect(markdown).toContain('## source');
    expect(markdown).toContain('- lib/app.js');
    expect(markdown).toContain('## tests');
  });

  test('renders counts and truncates long role sections deterministically', () => {
    const sourceFiles = Array.from({ length: 52 }, (_, index) => {
      const padded = String(index + 1).padStart(2, '0');
      return `lib/file-${padded}.js`;
    });

    const markdown = buildMapMarkdown(sourceFiles);

    expect(markdown).toContain('## source (52 files)');
    expect(markdown).toContain('- lib/file-01.js');
    expect(markdown).toContain('- lib/file-50.js');
    expect(markdown).not.toContain('- lib/file-51.js');
    expect(markdown).toContain('- ... and 2 more');
    expect(markdown).toContain('## tests (0 files)');
  });

  test('buildMap does not inherit restrictive generation extension config', async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, '.dir2txt.json'),
      JSON.stringify({
        includeExtensions: ['.js'],
        maxDepth: 1,
        maxFileSize: 5
      })
    );
    await fs.writeFile(path.join(testDir, 'package.json'), '{"name":"fixture"}');
    await fs.writeFile(path.join(testDir, 'README.md'), '# Fixture');
    await fs.writeFile(path.join(testDir, 'src/index.js'), 'console.log("ok");');

    const { files, markdown } = await buildMap(testDir);

    expect(files).toEqual(expect.arrayContaining([
      '.dir2txt.json',
      'README.md',
      'package.json',
      path.join('src', 'index.js')
    ]));
    expect(markdown).toContain('- README.md');
    expect(markdown).toContain('- package.json');
    expect(markdown).toContain('- src/index.js');
  });
});
