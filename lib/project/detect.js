import fg from 'fast-glob';
import { promises as fs } from 'fs';
import path from 'path';

const KEY_FILES = [
  'package.json',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'jest.config.js',
  'tsconfig.json'
];

const LANGUAGE_BY_EXTENSION = new Map([
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.json', 'json'],
  ['.md', 'markdown'],
  ['.css', 'css'],
  ['.scss', 'css'],
  ['.html', 'html'],
  ['.py', 'python'],
  ['.rb', 'ruby'],
  ['.go', 'go'],
  ['.rs', 'rust'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
  ['.swift', 'swift'],
  ['.php', 'php'],
  ['.sh', 'shell'],
  ['.bash', 'shell'],
  ['.zsh', 'shell'],
  ['.yml', 'yaml'],
  ['.yaml', 'yaml']
]);

async function readPackageJson(cwd) {
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    const rawPackageJson = await fs.readFile(packageJsonPath, 'utf8');
    return JSON.parse(rawPackageJson);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function fileExists(cwd, file) {
  try {
    const stats = await fs.stat(path.join(cwd, file));
    return stats.isFile();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function detectPackageManager(cwd) {
  if (await fileExists(cwd, 'pnpm-lock.yaml')) {
    return 'pnpm';
  }

  if (await fileExists(cwd, 'yarn.lock')) {
    return 'yarn';
  }

  if (await fileExists(cwd, 'package-lock.json')) {
    return 'npm';
  }

  return null;
}

function detectLanguages(files) {
  const languages = new Set();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION.get(path.extname(file).toLowerCase());
    if (language) {
      languages.add(language);
    }
  }

  return [...languages].sort();
}

function detectHasTests(files) {
  return files.some(file => {
    const normalizedFile = file.split(path.sep).join('/');
    const basename = path.basename(normalizedFile);

    return normalizedFile.startsWith('test/')
      || normalizedFile.startsWith('tests/')
      || basename.includes('.test.')
      || basename.includes('.spec.');
  });
}

async function detectKeyFiles(cwd) {
  const keyFiles = [];

  for (const keyFile of KEY_FILES) {
    if (await fileExists(cwd, keyFile)) {
      keyFiles.push(keyFile);
    }
  }

  return keyFiles;
}

/**
 * Detects project metadata from package files and a bounded repository scan.
 * @param {string} cwd - Directory to inspect.
 * @returns {Promise<Object>} Project metadata.
 */
export async function detectProject(cwd = process.cwd()) {
  const packageJson = await readPackageJson(cwd);
  const files = await fg('**/*', {
    cwd,
    deep: 4,
    dot: true,
    ignore: [
      'node_modules/**',
      '.git/**',
      'coverage/**',
      'dist/**',
      'build/**'
    ],
    onlyFiles: true,
    absolute: false
  });

  return {
    name: packageJson.name || path.basename(cwd),
    packageManager: await detectPackageManager(cwd),
    moduleType: packageJson.type || 'commonjs',
    scripts: packageJson.scripts || {},
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    languages: detectLanguages(files),
    keyFiles: await detectKeyFiles(cwd),
    fileCount: files.length,
    hasTests: detectHasTests(files)
  };
}
