import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { detectProject } from '../lib/project/detect.js';

const originalCwd = process.cwd();
const testDir = path.join(originalCwd, 'test-temp-project-detect');
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, 'lib'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'test'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
    name: 'fixture-app',
    description: 'A fixture project',
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

afterAll(() => {
  consoleLogSpy.mockRestore();
});

describe('Project Detection', () => {
  test('detects package metadata, files, languages, and tests', async () => {
    const project = await detectProject(testDir);

    expect(project.name).toBe('fixture-app');
    expect(project.description).toBe('A fixture project');
    expect(project.packageManager).toBe('npm');
    expect(project.moduleType).toBe('module');
    expect(project.scripts.test).toBe('jest');
    expect(project.languages).toContain('javascript');
    expect(project.keyFiles).toContain('package.json');
    expect(project.fileCount).toBe(4);
    expect(project.hasTests).toBe(true);
    expect(project.warnings).toEqual([]);
  });

  test('falls back and reports warnings for invalid package.json', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), '{"name":');

    const project = await detectProject(testDir);

    expect(project.name).toBe(path.basename(testDir));
    expect(project.moduleType).toBe('commonjs');
    expect(project.scripts).toEqual({});
    expect(project.dependencies).toEqual({});
    expect(project.devDependencies).toEqual({});
    expect(project.keyFiles).toContain('package.json');
    expect(project.hasTests).toBe(true);
    expect(project.warnings).toHaveLength(1);
    expect(project.warnings[0]).toContain('Invalid package.json');
  });

  test('prefers packageManager field over lockfiles', async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(testDir, 'package.json'), 'utf8'));
    packageJson.packageManager = 'pnpm@9.0.0';
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    const project = await detectProject(testDir);

    expect(project.packageManager).toBe('pnpm');
  });
});
