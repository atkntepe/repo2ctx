import { promises as fs } from 'fs';
import path from 'path';
import { detectProject } from '../lib/project/detect.js';

const originalCwd = process.cwd();
const testDir = path.join(originalCwd, 'test-temp-project-detect');

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, 'lib'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'test'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
    name: 'fixture-app',
    type: 'module',
    scripts: {
      test: 'jest'
    },
    dependencies: {
      commander: '^14.0.0'
    },
    devDependencies: {
      jest: '^30.0.5'
    }
  }, null, 2));
  await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
  await fs.writeFile(path.join(testDir, 'lib/index.js'), 'export const answer = 42;\n');
  await fs.writeFile(path.join(testDir, 'test/index.test.js'), 'test("works", () => {});\n');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Project Detection', () => {
  test('detects package metadata, files, languages, and tests', async () => {
    const project = await detectProject(testDir);

    expect(project.name).toBe('fixture-app');
    expect(project.packageManager).toBe('npm');
    expect(project.moduleType).toBe('module');
    expect(project.scripts.test).toBe('jest');
    expect(project.languages).toContain('javascript');
    expect(project.keyFiles).toContain('package.json');
    expect(project.fileCount).toBe(4);
    expect(project.hasTests).toBe(true);
  });
});
