import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { getFiles } from '../lib/traverse.js';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

const testDir = path.join(process.cwd(), 'test-temp-traverse');
const originalCwd = process.cwd();

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'node_modules/pkg'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.gitignore'), 'ignored/**\n**/*.log\n');
  await fs.writeFile(path.join(testDir, 'package.json'), '{"name":"fixture"}');
  await fs.writeFile(path.join(testDir, 'src/index.js'), 'console.log("ok");');
  await fs.writeFile(path.join(testDir, 'src/readme.md'), '# fixture');
  await fs.writeFile(path.join(testDir, 'debug.log'), 'log');
  await fs.writeFile(path.join(testDir, 'node_modules/pkg/index.js'), 'module.exports = {};');
  process.chdir(testDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Traverse Module', () => {
  test('respects gitignore and built-in ignored directories', async () => {
    const files = await getFiles();

    expect(files).toContain('package.json');
    expect(files).toContain(path.join('src', 'index.js'));
    expect(files).not.toContain('debug.log');
    expect(files.some(file => file.includes('node_modules'))).toBe(false);
  });

  test('filters by extension', async () => {
    const files = await getFiles({ includeExtensions: ['.js'] });

    expect(files).toEqual([path.join('src', 'index.js')]);
  });

  test('supports explicit cwd without changing process cwd', async () => {
    process.chdir(originalCwd);

    const files = await getFiles({ includeExtensions: ['.js'] }, testDir);

    expect(process.cwd()).toBe(originalCwd);
    expect(files).toEqual([path.join('src', 'index.js')]);
  });

  test('can skip config-derived extension and depth filters', async () => {
    await fs.writeFile(
      path.join(testDir, '.dir2txt.json'),
      JSON.stringify({
        includeExtensions: ['.js'],
        maxDepth: 1
      })
    );

    const files = await getFiles({ useConfig: false });

    expect(files).toContain('package.json');
    expect(files).toContain(path.join('src', 'index.js'));
    expect(files).toContain(path.join('src', 'readme.md'));
  });
});
