# repo2ctx Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `dir2txt` into `repo2ctx`, a local-first CLI that creates safe, task-focused AI coding-agent context while preserving backwards compatibility.

**Architecture:** Keep the existing CLI working while carving new focused modules out of the current large files. Add project detection, output safety, context builders, and agent-doc generation as small modules with tests before wiring them into commands.

**Tech Stack:** Node.js ES modules, Commander, fast-glob, ignore, clipboardy, chokidar, Jest with `--experimental-vm-modules`.

---

## File Structure

Create these new files:

- `lib/project/detect.js`: detects package metadata, package manager, scripts, languages, git state, and repo structure.
- `lib/output/redact.js`: redacts secrets from generated content.
- `lib/output/tokens.js`: estimates token counts for output.
- `lib/output/renderers.js`: renders markdown, XML, JSON, and plain text sections.
- `lib/context/brief.js`: builds repo brief data and markdown.
- `lib/context/map.js`: builds compact repo map data and markdown.
- `lib/context/task.js`: selects files for a task-focused context bundle.
- `lib/agents/generate.js`: generates `AGENTS.md` and optional `CLAUDE.md`.
- `test/project-detect.test.js`: tests project detection.
- `test/output-redact.test.js`: tests redaction.
- `test/output-tokens.test.js`: tests token estimation.
- `test/context-brief.test.js`: tests brief builder.
- `test/context-map.test.js`: tests repo map builder.
- `test/context-task.test.js`: tests task context selection.
- `test/agents-generate.test.js`: tests agent-doc generation.

Modify these existing files:

- `package.json`: rename package/bin identity, add aliases, update vulnerable dependencies.
- `package-lock.json`: refresh dependency lockfile.
- `bin/cli.js`: add `repo2ctx` command model and route `pack`/`run`/`brief`/`map`/`context`/`agents`.
- `lib/generate.js`: remove clipboard debug writes, call redaction/token helpers, support modern output formats through shared renderers.
- `lib/traverse.js`: improve default ignores and export focused helpers where needed.
- `lib/relationships.js`: reduce misleading framework claims and align tests to heuristic behavior.
- `lib/watcher.js`: fix asynchronous debounce teardown so tests finish cleanly.
- `README.md`: rewrite around `repo2ctx`.
- `test/generate.test.js`: replace shallow tests with real output tests.
- `test/traverse.test.js`: replace shallow tests with real traversal tests.
- `test/relationships.test.js`: align with honest heuristic relationship behavior.
- `test/watcher.test.js`: make async debounce tests deterministic.

## Task 1: Establish A Clean Test Baseline

**Files:**
- Modify: `test/generate.test.js`
- Modify: `test/traverse.test.js`
- Modify: `test/watcher.test.js`
- Modify: `test/relationships.test.js`
- Modify: `lib/watcher.js`
- Modify: `lib/relationships.js`

- [ ] **Step 1: Run the current full test suite**

Run:

```bash
npm test -- --runInBand
```

Expected: FAIL. Current known failures are watcher async teardown and relationship-analysis expectations that refer to fields not returned by `lib/relationships.js`.

- [ ] **Step 2: Replace shallow generate tests with real tree/output tests**

Modify `test/generate.test.js` to import real functions after exporting them in Task 1 Step 3:

```js
import { jest } from '@jest/globals';
import { generateFileTreeForTest, getLanguageFromExtensionForTest } from '../lib/generate.js';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Generate Module', () => {
  test('generates a stable tree for nested files', () => {
    const tree = generateFileTreeForTest([
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
    expect(getLanguageFromExtensionForTest('app.js')).toBe('javascript');
    expect(getLanguageFromExtensionForTest('types.ts')).toBe('typescript');
    expect(getLanguageFromExtensionForTest('README.md')).toBe('markdown');
    expect(getLanguageFromExtensionForTest('unknown.custom')).toBe('');
  });
});
```

- [ ] **Step 3: Export test-only generate helpers**

Modify the bottom of `lib/generate.js`:

```js
export const generateFileTreeForTest = generateFileTree;
export const getLanguageFromExtensionForTest = getLanguageFromExtension;
```

- [ ] **Step 4: Replace shallow traversal tests with real temp-directory tests**

Modify `test/traverse.test.js`:

```js
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
  await fs.writeFile(path.join(testDir, '.gitignore'), 'ignored/**\n*.log\n');
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
});
```

- [ ] **Step 5: Make watcher debounce awaitable**

Modify `lib/watcher.js` so `handleFileChange` stores the processing promise:

```js
async handleFileChange(eventType, filePath, watchPath) {
  const relativePath = path.relative(watchPath, filePath);

  this.log(`🔄 ${eventType.toUpperCase()}: ${relativePath}`);
  this.watchStats.totalChanges++;

  if (this.debounceTimers.has(watchPath)) {
    clearTimeout(this.debounceTimers.get(watchPath));
  }

  const timer = setTimeout(() => {
    const promise = this.processChanges(watchPath, eventType, filePath)
      .catch(error => {
        this.log(`❌ Error processing changes: ${error.message}`);
      })
      .finally(() => {
        this.debounceTimers.delete(watchPath);
        this.pendingProcessPromise = null;
      });

    this.pendingProcessPromise = promise;
  }, this.config.debounceDelay);

  this.debounceTimers.set(watchPath, timer);
}

async flushPendingChanges() {
  if (this.pendingProcessPromise) {
    await this.pendingProcessPromise;
  }
}
```

Also initialize `this.pendingProcessPromise = null;` in the constructor.

- [ ] **Step 6: Await watcher debounce in tests**

In `test/watcher.test.js`, after tests that trigger debounced changes, replace raw timing-only assertions with:

```js
await new Promise(resolve => setTimeout(resolve, 150));
await watcher.flushPendingChanges();
expect(generateOutputSpy).toHaveBeenCalledTimes(1);
```

Expected: no more “Cannot log after tests are done” output.

- [ ] **Step 7: Align relationship tests with current heuristic behavior**

Modify `test/relationships.test.js` so it no longer expects `frameworks` until framework detection is implemented. For JavaScript import/export:

```js
expect(result).toMatchObject({
  filePath: '/test/app.js',
  language: 'javascript',
  summary: expect.any(String),
  imports: expect.arrayContaining([
    expect.objectContaining({ path: 'react' }),
    expect.objectContaining({ path: './utils.js' })
  ]),
  exports: expect.arrayContaining([
    expect.objectContaining({ name: 'App' })
  ])
});
```

For grouping, assert parent-directory grouping:

```js
expect(groups.has('components')).toBe(true);
expect(groups.get('components')).toContain('/test/components/App.jsx');
```

For dependency graph, assert either connector:

```js
expect(graph).toMatch(/├──|└──/);
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm test -- --runInBand test/generate.test.js test/traverse.test.js test/relationships.test.js test/watcher.test.js
```

Expected: PASS.

- [ ] **Step 9: Run full tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/generate.js lib/watcher.js lib/relationships.js test/generate.test.js test/traverse.test.js test/watcher.test.js test/relationships.test.js
git commit -m "test: restore baseline coverage"
```

## Task 2: Update Dependency Health

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Verify production audit failure**

Run:

```bash
npm audit --omit=dev --cache /private/tmp/dir2txt-npm-cache
```

Expected: FAIL with high severity `picomatch <=2.3.1`.

- [ ] **Step 2: Apply safe audit fix**

Run:

```bash
npm audit fix --cache /private/tmp/dir2txt-npm-cache
```

Expected: package lock updates. Do not accept `--force` unless a later explicit review approves breaking upgrades.

- [ ] **Step 3: Run production audit again**

Run:

```bash
npm audit --omit=dev --cache /private/tmp/dir2txt-npm-cache
```

Expected: PASS or no production vulnerabilities. If dev-only vulnerabilities remain, record them in the commit body and continue.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: refresh dependency audit baseline"
```

## Task 3: Add Output Safety Helpers

**Files:**
- Create: `lib/output/redact.js`
- Create: `lib/output/tokens.js`
- Create: `test/output-redact.test.js`
- Create: `test/output-tokens.test.js`

- [ ] **Step 1: Write redaction tests**

Create `test/output-redact.test.js`:

```js
import { redactContent, redactFileContent } from '../lib/output/redact.js';

describe('output redaction', () => {
  test('redacts common secret assignments', () => {
    const input = [
      'OPENAI_API_KEY=sk-proj-1234567890abcdef',
      'ANTHROPIC_API_KEY=sk-ant-api03-abcdef',
      'normal=value'
    ].join('\n');

    const output = redactContent(input);

    expect(output).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(output).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(output).toContain('normal=value');
    expect(output).not.toContain('sk-proj-1234567890abcdef');
  });

  test('redacts dotenv files by path with a clear marker', () => {
    const output = redactFileContent('.env.local', 'DATABASE_URL=postgres://user:pass@example/db');

    expect(output).toBe('[REDACTED: dotenv file]');
  });
});
```

- [ ] **Step 2: Implement redaction helper**

Create `lib/output/redact.js`:

```js
const SECRET_KEY_PATTERN = /(^|\n)([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*\s*=\s*)([^\n]+)/gi;

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\.|$)/,
  /(^|\/)\.env(?:\.|$)/,
  /id_rsa$/,
  /id_ed25519$/,
  /\.pem$/,
  /\.key$/
];

export function isSensitiveFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

export function redactContent(content) {
  return content.replace(SECRET_KEY_PATTERN, (match, prefix, key) => {
    return `${prefix}${key}[REDACTED]`;
  });
}

export function redactFileContent(filePath, content, options = {}) {
  const enabled = options.redact !== false;
  if (!enabled) return content;
  if (isSensitiveFile(filePath)) return '[REDACTED: sensitive file]'.replace('sensitive file', filePath.includes('.env') ? 'dotenv file' : 'sensitive file');
  return redactContent(content);
}
```

- [ ] **Step 3: Write token tests**

Create `test/output-tokens.test.js`:

```js
import { estimateTokens, formatTokenEstimate } from '../lib/output/tokens.js';

describe('token estimation', () => {
  test('estimates tokens using a conservative character ratio', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(401))).toBe(101);
  });

  test('formats token estimate with characters', () => {
    expect(formatTokenEstimate('hello world')).toBe('~3 tokens / 11 chars');
  });
});
```

- [ ] **Step 4: Implement token helper**

Create `lib/output/tokens.js`:

```js
export function estimateTokens(content) {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export function formatTokenEstimate(content) {
  return `~${estimateTokens(content).toLocaleString()} tokens / ${content.length.toLocaleString()} chars`;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand test/output-redact.test.js test/output-tokens.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/output/redact.js lib/output/tokens.js test/output-redact.test.js test/output-tokens.test.js
git commit -m "feat: add output safety helpers"
```

## Task 4: Modernize Pack Output

**Files:**
- Create: `lib/output/renderers.js`
- Modify: `lib/generate.js`
- Modify: `bin/cli.js`
- Modify: `test/generate.test.js`

- [ ] **Step 1: Add renderer tests**

Append to `test/generate.test.js`:

```js
import { renderSection } from '../lib/output/renderers.js';

test('renders XML sections with escaped content', () => {
  const output = renderSection('file', 'a < b', { format: 'xml', attributes: { path: 'src/a.js' } });

  expect(output).toBe('<file path="src/a.js">a &lt; b</file>\n');
});
```

- [ ] **Step 2: Implement renderers**

Create `lib/output/renderers.js`:

```js
function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderSection(name, content, options = {}) {
  const format = options.format || 'text';
  const attributes = options.attributes || {};

  if (format === 'json') {
    return JSON.stringify({ type: name, attributes, content }, null, 2) + '\n';
  }

  if (format === 'xml') {
    const attrs = Object.entries(attributes)
      .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
      .join('');
    return `<${name}${attrs}>${escapeXml(content)}</${name}>\n`;
  }

  if (format === 'markdown') {
    return `## ${name}\n\n${content}\n`;
  }

  return content.endsWith('\n') ? content : `${content}\n`;
}
```

- [ ] **Step 3: Remove clipboard debug writes and apply redaction**

Modify `lib/generate.js`:

```js
import { redactFileContent } from './output/redact.js';
import { formatTokenEstimate } from './output/tokens.js';
```

In `finalizeClipboardOutput`, remove all debug file writes and read-back logs. The function body should be:

```js
async function finalizeClipboardOutput(options) {
  if (options.clipboard && options._clipboardBuffer) {
    try {
      const clipboardText = options._clipboardBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      await clipboardy.write(clipboardText);
      console.log(`📋 Copied ${clipboardText.length} characters to clipboard`);
    } catch (error) {
      console.error(`❌ Error copying to clipboard: ${error.message}`);
      throw error;
    }
  }
}
```

After reading file content in `readFileContent`, add:

```js
const safeContent = redactFileContent(filePath, content, { redact: options.redact });
```

Return `safeContent` instead of `content`.

- [ ] **Step 4: Add token estimate to summary**

In `generateText`, track written content by adding `options._writtenChars = 0` in `writeOutput`:

```js
options._writtenChars = (options._writtenChars || 0) + content.length;
```

Before final summary, add:

```js
const tokenSummary = formatTokenEstimate('x'.repeat(options._writtenChars || 0));
```

Add to the summary:

```js
`Estimated size: ${tokenSummary}\n`
```

- [ ] **Step 5: Wire `pack` alias and format option**

In `bin/cli.js`, create a shared function:

```js
async function runPackCommand(options) {
  return runCommandAction(options);
}
```

Rename the current `.action(async (options) => { ... })` body to `runCommandAction`.

Add command:

```js
program
  .command('pack')
  .description('Generate AI-ready context pack from directory structure and files')
  .option('--format <format>', 'Output format: text, markdown, xml, json', 'text')
  .option('--redact', 'Redact common secrets from output', true)
  .allowUnknownOption(false)
  .action(runPackCommand);
```

Make `run` call the same `runCommandAction`. Existing `--markdown` should set `format` to `markdown` when no explicit format is provided.

- [ ] **Step 6: Run CLI smoke tests**

Run:

```bash
node bin/cli.js pack --dry
node bin/cli.js run --dry
```

Expected: both commands complete and print the project tree.

- [ ] **Step 7: Run full tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add bin/cli.js lib/generate.js lib/output/renderers.js test/generate.test.js
git commit -m "feat: modernize pack output"
```

## Task 5: Add repo2ctx Identity And Compatibility Alias

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `bin/cli.js`
- Modify: `README.md`

- [ ] **Step 1: Update package metadata**

Modify `package.json`:

```json
{
  "name": "repo2ctx",
  "version": "1.0.0",
  "description": "Prepare safe, task-focused repository context for AI coding agents",
  "bin": {
    "repo2ctx": "./bin/cli.js",
    "dir2txt": "./bin/cli.js"
  }
}
```

Keep existing dependencies and scripts unless changed by earlier tasks.

- [ ] **Step 2: Update program name dynamically**

In `bin/cli.js`, set the command name from `process.argv[1]`:

```js
const invokedName = path.basename(process.argv[1] || 'repo2ctx');

program
  .name(invokedName === 'dir2txt' ? 'dir2txt' : 'repo2ctx')
  .description(packageInfo.description || 'Prepare repository context for AI coding agents')
  .version(packageInfo.version || '1.0.0');
```

- [ ] **Step 3: Refresh lockfile**

Run:

```bash
npm install --package-lock-only --cache /private/tmp/dir2txt-npm-cache
```

Expected: `package-lock.json` package name changes to `repo2ctx`.

- [ ] **Step 4: Update README title and quick start**

Modify the README header:

```md
# repo2ctx

Prepare safe, task-focused repository context for AI coding agents.

> Formerly `dir2txt`. The `dir2txt` binary remains available as a compatibility alias.
```

Add quick-start commands:

```md
```bash
repo2ctx brief
repo2ctx map
repo2ctx pack --format markdown --output repo-context.md
repo2ctx context "fix watcher test failures"
repo2ctx agents
```
```

- [ ] **Step 5: Run identity smoke tests**

Run:

```bash
node bin/cli.js --help
node bin/cli.js pack --dry
```

Expected: help text describes `repo2ctx`; pack still works.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json bin/cli.js README.md
git commit -m "chore: rename project to repo2ctx"
```

## Task 6: Add Project Detection

**Files:**
- Create: `lib/project/detect.js`
- Create: `test/project-detect.test.js`

- [ ] **Step 1: Write project detection tests**

Create `test/project-detect.test.js`:

```js
import { promises as fs } from 'fs';
import path from 'path';
import { detectProject } from '../lib/project/detect.js';

const fixtureDir = path.join(process.cwd(), 'test-temp-project-detect');
const originalCwd = process.cwd();

beforeEach(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
  await fs.mkdir(path.join(fixtureDir, 'lib'), { recursive: true });
  await fs.mkdir(path.join(fixtureDir, 'test'), { recursive: true });
  await fs.writeFile(path.join(fixtureDir, 'package.json'), JSON.stringify({
    name: 'fixture-app',
    type: 'module',
    scripts: {
      test: 'jest',
      start: 'node index.js'
    },
    dependencies: {
      commander: '^14.0.0'
    }
  }, null, 2));
  await fs.writeFile(path.join(fixtureDir, 'package-lock.json'), '{}');
  await fs.writeFile(path.join(fixtureDir, 'lib/index.js'), 'export function run() {}');
  await fs.writeFile(path.join(fixtureDir, 'test/index.test.js'), 'test("ok", () => {});');
  process.chdir(fixtureDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

describe('detectProject', () => {
  test('detects package metadata, scripts, package manager, and languages', async () => {
    const project = await detectProject();

    expect(project.name).toBe('fixture-app');
    expect(project.packageManager).toBe('npm');
    expect(project.moduleType).toBe('module');
    expect(project.scripts.test).toBe('jest');
    expect(project.languages).toContain('javascript');
    expect(project.keyFiles).toContain('package.json');
    expect(project.hasTests).toBe(true);
  });
});
```

- [ ] **Step 2: Implement project detection**

Create `lib/project/detect.js`:

```js
import { promises as fs } from 'fs';
import path from 'path';
import { getFiles } from '../traverse.js';

const LANGUAGE_BY_EXTENSION = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.css': 'css',
  '.html': 'html',
  '.md': 'markdown'
};

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectProject(cwd = process.cwd()) {
  const packageJson = await readJsonIfExists(path.join(cwd, 'package.json'));
  const files = await getFiles({ maxDepth: 4, maxFileSize: 262144 });
  const keyFiles = files.filter(file => /(^|\/)(package\.json|README\.md|AGENTS\.md|CLAUDE\.md|jest\.config\.js|tsconfig\.json)$/.test(file));
  const languageSet = new Set();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[path.extname(file).toLowerCase()];
    if (language) languageSet.add(language);
  }

  let packageManager = 'unknown';
  if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (await fileExists(path.join(cwd, 'yarn.lock'))) packageManager = 'yarn';
  else if (await fileExists(path.join(cwd, 'package-lock.json'))) packageManager = 'npm';

  return {
    name: packageJson?.name || path.basename(cwd),
    description: packageJson?.description || '',
    packageManager,
    moduleType: packageJson?.type || 'commonjs',
    scripts: packageJson?.scripts || {},
    dependencies: Object.keys(packageJson?.dependencies || {}),
    devDependencies: Object.keys(packageJson?.devDependencies || {}),
    languages: Array.from(languageSet).sort(),
    keyFiles,
    fileCount: files.length,
    hasTests: files.some(file => /(^|\/)(test|tests|__tests__)\//.test(file) || /\.(test|spec)\.[^.]+$/.test(file))
  };
}
```

- [ ] **Step 3: Run focused test**

Run:

```bash
npm test -- --runInBand test/project-detect.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/project/detect.js test/project-detect.test.js
git commit -m "feat: detect project metadata"
```

## Task 7: Add `brief` Command

**Files:**
- Create: `lib/context/brief.js`
- Create: `test/context-brief.test.js`
- Modify: `bin/cli.js`

- [ ] **Step 1: Write brief tests**

Create `test/context-brief.test.js`:

```js
import { buildBriefMarkdown } from '../lib/context/brief.js';

describe('brief builder', () => {
  test('renders project metadata and scripts', () => {
    const markdown = buildBriefMarkdown({
      name: 'repo2ctx',
      description: 'Prepare context',
      packageManager: 'npm',
      moduleType: 'module',
      scripts: { test: 'jest', start: 'node index.js' },
      languages: ['javascript', 'markdown'],
      keyFiles: ['package.json', 'README.md'],
      fileCount: 24,
      hasTests: true
    });

    expect(markdown).toContain('# repo2ctx Brief');
    expect(markdown).toContain('Prepare context');
    expect(markdown).toContain('- Package manager: npm');
    expect(markdown).toContain('- `npm test` -> `jest`');
    expect(markdown).toContain('- javascript');
  });
});
```

- [ ] **Step 2: Implement brief builder**

Create `lib/context/brief.js`:

```js
import { detectProject } from '../project/detect.js';

export function buildBriefMarkdown(project) {
  const lines = [];
  lines.push(`# ${project.name} Brief`);
  lines.push('');
  if (project.description) lines.push(project.description, '');
  lines.push('## Project');
  lines.push(`- Package manager: ${project.packageManager}`);
  lines.push(`- Module type: ${project.moduleType}`);
  lines.push(`- Files scanned: ${project.fileCount}`);
  lines.push(`- Tests detected: ${project.hasTests ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Languages');
  for (const language of project.languages) lines.push(`- ${language}`);
  lines.push('');
  lines.push('## Scripts');
  const scriptEntries = Object.entries(project.scripts);
  if (scriptEntries.length === 0) lines.push('- No package scripts detected');
  for (const [name, command] of scriptEntries) lines.push(`- \`npm ${name === 'start' ? 'start' : `run ${name}`}\` -> \`${command}\``);
  lines.push('');
  lines.push('## Key Files');
  if (project.keyFiles.length === 0) lines.push('- No key files detected');
  for (const file of project.keyFiles) lines.push(`- ${file}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function buildBrief(cwd = process.cwd()) {
  const project = await detectProject(cwd);
  return {
    project,
    markdown: buildBriefMarkdown(project)
  };
}
```

- [ ] **Step 3: Wire brief command**

Modify `bin/cli.js` imports:

```js
import { buildBrief } from '../lib/context/brief.js';
```

Add command:

```js
program
  .command('brief')
  .description('Generate a compact repository brief for AI agents')
  .option('--output <file>', 'Write brief to file instead of stdout')
  .action(async (options) => {
    try {
      const { markdown } = await buildBrief();
      if (options.output) {
        await fs.writeFile(options.output, markdown, 'utf8');
        console.log(`💾 Brief written to: ${options.output}`);
      } else {
        process.stdout.write(markdown);
      }
    } catch (error) {
      console.error(`❌ Error generating brief: ${error.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Run focused tests and smoke command**

Run:

```bash
npm test -- --runInBand test/context-brief.test.js test/project-detect.test.js
node bin/cli.js brief
```

Expected: tests pass and command prints a brief.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js lib/context/brief.js test/context-brief.test.js
git commit -m "feat: add repository brief command"
```

## Task 8: Add `map` Command

**Files:**
- Create: `lib/context/map.js`
- Create: `test/context-map.test.js`
- Modify: `bin/cli.js`

- [ ] **Step 1: Write map tests**

Create `test/context-map.test.js`:

```js
import { buildMapMarkdown, classifyFileRole } from '../lib/context/map.js';

describe('repo map builder', () => {
  test('classifies common file roles', () => {
    expect(classifyFileRole('package.json')).toBe('config');
    expect(classifyFileRole('README.md')).toBe('docs');
    expect(classifyFileRole('test/app.test.js')).toBe('tests');
    expect(classifyFileRole('lib/app.js')).toBe('source');
  });

  test('renders files grouped by role', () => {
    const markdown = buildMapMarkdown([
      'package.json',
      'README.md',
      'lib/app.js',
      'test/app.test.js'
    ]);

    expect(markdown).toContain('# Repository Map');
    expect(markdown).toContain('## source');
    expect(markdown).toContain('- lib/app.js');
    expect(markdown).toContain('## tests');
  });
});
```

- [ ] **Step 2: Implement map builder**

Create `lib/context/map.js`:

```js
import path from 'path';
import { getFiles } from '../traverse.js';

export function classifyFileRole(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized).toLowerCase();
  if (/^(readme|license|changelog|contributing)/i.test(base) || normalized.startsWith('docs/')) return 'docs';
  if (/(\.test\.|\.spec\.|^test\/|^tests\/|\/__tests__\/)/.test(normalized)) return 'tests';
  if (/(package\.json|tsconfig\.json|jest\.config\.js|eslint|prettier|\.config\.)/.test(base)) return 'config';
  if (/^(bin|lib|src)\//.test(normalized)) return 'source';
  return 'other';
}

export function buildMapMarkdown(files) {
  const groups = new Map();
  for (const file of files) {
    const role = classifyFileRole(file);
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(file);
  }

  const lines = ['# Repository Map', ''];
  for (const role of ['source', 'tests', 'config', 'docs', 'other']) {
    const roleFiles = groups.get(role) || [];
    if (roleFiles.length === 0) continue;
    lines.push(`## ${role}`, '');
    for (const file of roleFiles.sort()) lines.push(`- ${file}`);
    lines.push('');
  }

  lines.push('_Map is heuristic and intended for navigation._', '');
  return lines.join('\n');
}

export async function buildMap() {
  const files = await getFiles({ maxFileSize: 262144 });
  return {
    files,
    markdown: buildMapMarkdown(files)
  };
}
```

- [ ] **Step 3: Wire map command**

Modify `bin/cli.js` imports:

```js
import { buildMap } from '../lib/context/map.js';
```

Add command:

```js
program
  .command('map')
  .description('Generate a compact repository navigation map')
  .option('--output <file>', 'Write map to file instead of stdout')
  .action(async (options) => {
    try {
      const { markdown } = await buildMap();
      if (options.output) {
        await fs.writeFile(options.output, markdown, 'utf8');
        console.log(`💾 Map written to: ${options.output}`);
      } else {
        process.stdout.write(markdown);
      }
    } catch (error) {
      console.error(`❌ Error generating map: ${error.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Run tests and smoke command**

Run:

```bash
npm test -- --runInBand test/context-map.test.js
node bin/cli.js map
```

Expected: tests pass and command prints grouped files.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js lib/context/map.js test/context-map.test.js
git commit -m "feat: add repository map command"
```

## Task 9: Add `agents` Command

**Files:**
- Create: `lib/agents/generate.js`
- Create: `test/agents-generate.test.js`
- Modify: `bin/cli.js`

- [ ] **Step 1: Write agent generation tests**

Create `test/agents-generate.test.js`:

```js
import { buildAgentsMarkdown, buildClaudeMarkdown } from '../lib/agents/generate.js';

describe('agent docs generation', () => {
  const project = {
    name: 'repo2ctx',
    description: 'Prepare context',
    packageManager: 'npm',
    scripts: { test: 'jest', start: 'node index.js' },
    languages: ['javascript'],
    keyFiles: ['package.json', 'README.md'],
    hasTests: true
  };

  test('generates AGENTS.md without invented conventions', () => {
    const markdown = buildAgentsMarkdown(project);

    expect(markdown).toContain('# AGENTS.md');
    expect(markdown).toContain('repo2ctx');
    expect(markdown).toContain('npm test');
    expect(markdown).not.toContain('No package scripts detected.');
  });

  test('generates Claude compatibility wrapper', () => {
    const markdown = buildClaudeMarkdown();

    expect(markdown).toContain('@AGENTS.md');
  });
});
```

- [ ] **Step 2: Implement agent generator**

Create `lib/agents/generate.js`:

```js
import { detectProject } from '../project/detect.js';

export function buildAgentsMarkdown(project) {
  const lines = ['# AGENTS.md', ''];
  lines.push(`## Project`);
  lines.push(`- Name: ${project.name}`);
  if (project.description) lines.push(`- Description: ${project.description}`);
  lines.push(`- Package manager: ${project.packageManager}`);
  lines.push(`- Languages: ${project.languages.join(', ') || 'unknown'}`);
  lines.push('');
  lines.push('## Commands');
  const scripts = Object.entries(project.scripts || {});
  if (scripts.length === 0) {
    lines.push('- No package scripts detected.');
  } else {
    for (const [name, command] of scripts) {
      const npmCommand = name === 'start' ? 'npm start' : `npm run ${name}`;
      lines.push(`- \`${npmCommand}\`: \`${command}\``);
    }
  }
  lines.push('');
  lines.push('## Structure');
  for (const file of project.keyFiles || []) lines.push(`- \`${file}\``);
  if (!project.keyFiles?.length) lines.push('- No key files detected.');
  lines.push('');
  lines.push('## Testing Notes');
  lines.push(project.hasTests ? '- Tests are present. Run the relevant test command before claiming completion.' : '- No tests were detected. Add focused tests for behavior changes when practical.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function buildClaudeMarkdown() {
  return '# CLAUDE.md\n\n@AGENTS.md\n';
}

export async function buildAgentDocs(cwd = process.cwd()) {
  const project = await detectProject(cwd);
  return {
    agents: buildAgentsMarkdown(project),
    claude: buildClaudeMarkdown()
  };
}
```

- [ ] **Step 3: Wire agents command**

Modify `bin/cli.js` imports:

```js
import { buildAgentDocs } from '../lib/agents/generate.js';
```

Add command:

```js
program
  .command('agents')
  .description('Generate AI agent project instruction files')
  .option('--claude', 'Also generate CLAUDE.md wrapper')
  .option('--dry', 'Print generated AGENTS.md instead of writing files')
  .action(async (options) => {
    try {
      const docs = await buildAgentDocs();
      if (options.dry) {
        process.stdout.write(docs.agents);
        return;
      }
      await fs.writeFile('AGENTS.md', docs.agents, 'utf8');
      console.log('💾 Wrote AGENTS.md');
      if (options.claude) {
        await fs.writeFile('CLAUDE.md', docs.claude, 'utf8');
        console.log('💾 Wrote CLAUDE.md');
      }
    } catch (error) {
      console.error(`❌ Error generating agent docs: ${error.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Run tests and dry smoke command**

Run:

```bash
npm test -- --runInBand test/agents-generate.test.js
node bin/cli.js agents --dry
```

Expected: tests pass and command prints AGENTS.md content without writing files.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js lib/agents/generate.js test/agents-generate.test.js
git commit -m "feat: add agent docs generation"
```

## Task 10: Add `context "task"` Command

**Files:**
- Create: `lib/context/task.js`
- Create: `test/context-task.test.js`
- Modify: `bin/cli.js`

- [ ] **Step 1: Write task-context tests**

Create `test/context-task.test.js`:

```js
import { selectTaskFiles, buildTaskContextMarkdown } from '../lib/context/task.js';

describe('task context builder', () => {
  test('selects files by task terms and always includes config/test hints', () => {
    const files = [
      'package.json',
      'lib/watcher.js',
      'test/watcher.test.js',
      'lib/generate.js'
    ];

    const selected = selectTaskFiles('fix watcher tests', files);

    expect(selected.map(item => item.file)).toContain('lib/watcher.js');
    expect(selected.map(item => item.file)).toContain('test/watcher.test.js');
    expect(selected.map(item => item.file)).toContain('package.json');
  });

  test('renders why files were selected', () => {
    const markdown = buildTaskContextMarkdown('fix watcher tests', [
      { file: 'lib/watcher.js', reason: 'matched task term "watcher"' }
    ], '# Brief');

    expect(markdown).toContain('# Task Context');
    expect(markdown).toContain('fix watcher tests');
    expect(markdown).toContain('matched task term');
  });
});
```

- [ ] **Step 2: Implement task context builder**

Create `lib/context/task.js`:

```js
import { getFiles } from '../traverse.js';
import { buildBrief } from './brief.js';

function termsFromTask(task) {
  return task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length >= 3 && !['fix', 'add', 'the', 'and', 'for', 'with'].includes(term));
}

export function selectTaskFiles(task, files, options = {}) {
  const terms = termsFromTask(task);
  const selected = new Map();
  const maxFiles = options.maxFiles || 20;

  function add(file, reason) {
    if (!selected.has(file)) selected.set(file, { file, reason });
  }

  for (const file of files) {
    const normalized = file.toLowerCase();
    for (const term of terms) {
      if (normalized.includes(term)) add(file, `matched task term "${term}"`);
    }
  }

  for (const file of files) {
    if (/package\.json|jest\.config\.js|tsconfig\.json|README\.md/.test(file)) add(file, 'included as project context');
  }

  for (const file of files) {
    if (/(\.test\.|\.spec\.|^test\/|^tests\/)/.test(file) && terms.some(term => file.toLowerCase().includes(term))) {
      add(file, 'included as relevant test file');
    }
  }

  return Array.from(selected.values()).slice(0, maxFiles);
}

export function buildTaskContextMarkdown(task, selectedFiles, briefMarkdown) {
  const lines = ['# Task Context', '', `Task: ${task}`, '', briefMarkdown.trim(), '', '## Selected Files'];
  for (const item of selectedFiles) {
    lines.push(`- \`${item.file}\`: ${item.reason}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function buildTaskContext(task) {
  const files = await getFiles({ maxFileSize: 262144 });
  const brief = await buildBrief();
  const selectedFiles = selectTaskFiles(task, files);
  return {
    files: selectedFiles,
    markdown: buildTaskContextMarkdown(task, selectedFiles, brief.markdown)
  };
}
```

- [ ] **Step 3: Wire context command**

Modify `bin/cli.js` imports:

```js
import { buildTaskContext } from '../lib/context/task.js';
```

Add command:

```js
program
  .command('context <task>')
  .description('Generate task-focused context for an AI coding agent')
  .option('--output <file>', 'Write context to file instead of stdout')
  .action(async (task, options) => {
    try {
      const { markdown } = await buildTaskContext(task);
      if (options.output) {
        await fs.writeFile(options.output, markdown, 'utf8');
        console.log(`💾 Task context written to: ${options.output}`);
      } else {
        process.stdout.write(markdown);
      }
    } catch (error) {
      console.error(`❌ Error generating task context: ${error.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Run tests and smoke command**

Run:

```bash
npm test -- --runInBand test/context-task.test.js
node bin/cli.js context "fix watcher tests"
```

Expected: tests pass and command prints a task context with selected files.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js lib/context/task.js test/context-task.test.js
git commit -m "feat: add task context command"
```

## Task 11: Update README For repo2ctx

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace old positioning**

Rewrite the first sections of `README.md` around this shape:

```md
# repo2ctx

Prepare safe, task-focused repository context for AI coding agents.

`repo2ctx` helps local developers generate briefs, maps, full context packs, task bundles, and agent instruction files from a repository.

Formerly `dir2txt`. The `dir2txt` binary remains available as a compatibility alias.

## Quick Start

```bash
npm install -g repo2ctx
repo2ctx brief
repo2ctx map
repo2ctx context "fix watcher tests"
repo2ctx agents
repo2ctx pack --format markdown --output repo-context.md
```
```

- [ ] **Step 2: Document command model**

Add a command table:

```md
| Command | Purpose |
| --- | --- |
| `brief` | Concise repo overview for agents |
| `map` | Compact navigation map |
| `context "task"` | Task-focused context bundle |
| `agents` | Generate `AGENTS.md` and optional `CLAUDE.md` |
| `pack` | Full repo export with redaction and token estimate |
| `run` | Compatibility alias for older `dir2txt` workflows |
```

- [ ] **Step 3: Document safety defaults**

Add:

```md
## Safety Defaults

`repo2ctx` redacts common secret assignments and skips sensitive files such as dotenv files by default. Review generated output before sharing it outside your local machine.
```

- [ ] **Step 4: Run docs smoke commands**

Run:

```bash
node bin/cli.js brief
node bin/cli.js map
node bin/cli.js agents --dry
node bin/cli.js context "fix watcher tests"
```

Expected: all commands complete.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: introduce repo2ctx workflow"
```

## Task 12: Final Verification And Release Readiness

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run audit**

Run:

```bash
npm audit --omit=dev --cache /private/tmp/dir2txt-npm-cache
```

Expected: PASS for production dependencies.

- [ ] **Step 3: Run CLI smoke matrix**

Run:

```bash
node bin/cli.js --help
node bin/cli.js brief
node bin/cli.js map
node bin/cli.js pack --dry
node bin/cli.js run --dry
node bin/cli.js agents --dry
node bin/cli.js context "fix watcher tests"
```

Expected: every command exits 0.

- [ ] **Step 4: Check generated files are not accidentally left behind**

Run:

```bash
git status --short --untracked-files=all
```

Expected: only intentional tracked changes. No `debug-clipboard-content.txt`, generated context files, `.dir2txt-cache`, or temp test directories.

- [ ] **Step 5: Commit final fixes if any**

If verification required fixes:

Run `git status --short`, stage the specific files changed during verification, then commit them:

```bash
git add bin/cli.js lib/generate.js README.md
git commit -m "chore: finalize repo2ctx pivot"
```

If no fixes were needed, do not create an empty commit.

## Spec Coverage Review

This plan covers:

- Rename identity to `repo2ctx`: Task 5.
- Keep `dir2txt` compatibility: Task 5.
- Keep `run` as `pack` alias: Task 4.
- Output safety, token estimates, and redaction: Tasks 3 and 4.
- `brief`: Task 7.
- `map`: Task 8.
- `agents`: Task 9.
- `context "task"`: Task 10.
- Cleanup phase and test health: Tasks 1 and 2.
- README update: Task 11.
- Final verification: Task 12.

Deferred by design:

- Hosted web app.
- Browser extension.
- MCP server.
- Remote repository ingestion.
- Semantic embeddings.
- Paid AI summaries.
- Deep AST analysis for every language.
