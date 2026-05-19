import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildTaskContext,
  buildTaskContextMarkdown,
  selectTaskFiles
} from '../lib/context/task.js';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const testDir = path.join(process.cwd(), 'test-temp-context-task');

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('task context builder', () => {
  test('selects files by task terms and always includes config/test hints', () => {
    const files = [
      'package.json',
      'lib/watcher.js',
      'test/watcher.test.js',
      'lib/generate.js'
    ];

    const selected = selectTaskFiles('fix watcher tests', files);
    const selectedFiles = selected.map(item => item.file);

    expect(selectedFiles).toContain('lib/watcher.js');
    expect(selectedFiles).toContain('test/watcher.test.js');
    expect(selectedFiles).toContain('package.json');
  });

  test('renders why files were selected', () => {
    const markdown = buildTaskContextMarkdown('fix watcher tests', [
      { file: 'lib/watcher.js', reason: 'matched task term "watcher"' }
    ], '# Brief');

    expect(markdown).toContain('# Task Context');
    expect(markdown).toContain('fix watcher tests');
    expect(markdown).toContain('matched task term');
  });

  test('buildTaskContext does not inherit restrictive generation config filters', async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'test'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, '.dir2txt.json'),
      JSON.stringify({
        includeExtensions: ['.md'],
        maxDepth: 1,
        maxFileSize: 5
      })
    );
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        type: 'module',
        scripts: {
          test: 'jest'
        }
      })
    );
    await fs.writeFile(path.join(testDir, 'README.md'), '# Fixture');
    await fs.writeFile(path.join(testDir, 'src/watcher.js'), 'export function watch() { return true; }');
    await fs.writeFile(path.join(testDir, 'test/watcher.test.js'), 'test("watcher", () => {});');

    const { files, markdown } = await buildTaskContext('fix watcher tests', testDir);
    const selectedFiles = files.map(item => item.file);

    expect(selectedFiles).toEqual(expect.arrayContaining([
      'package.json',
      path.join('src', 'watcher.js'),
      path.join('test', 'watcher.test.js')
    ]));
    expect(markdown).toContain('- `src/watcher.js`: matched task term "watcher"');
    expect(markdown).toContain('- `test/watcher.test.js`: matched task term "watcher"');
  });
});
