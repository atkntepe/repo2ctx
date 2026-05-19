import path from 'path';
import { getFiles } from '../traverse.js';

const ROLE_ORDER = ['source', 'tests', 'config', 'docs', 'other'];
const DEFAULT_MAX_FILES_PER_ROLE = 50;
const MAP_MAX_FILE_SIZE = 1024 * 1024;
const CONFIG_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'jsconfig.json',
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'vite.config.js',
  'vite.config.ts',
  'webpack.config.js',
  'rollup.config.js',
  'eslint.config.js',
  '.eslintrc',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
  '.gitignore',
  '.npmrc'
]);
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt']);
const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.sass',
  '.html',
  '.vue',
  '.svelte',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.swift',
  '.kt'
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * Classifies a repository file into a compact navigation role.
 * @param {string} filePath - Repository-relative file path.
 * @returns {'source'|'tests'|'config'|'docs'|'other'} File role.
 */
export function classifyFileRole(filePath) {
  const normalized = normalizePath(filePath);
  const lower = normalized.toLowerCase();
  const baseName = path.posix.basename(lower);
  const extension = path.posix.extname(lower);
  const segments = lower.split('/');

  if (
    segments.includes('test') ||
    segments.includes('tests') ||
    segments.includes('__tests__') ||
    /\.test\.[^.]+$/u.test(lower) ||
    /\.spec\.[^.]+$/u.test(lower)
  ) {
    return 'tests';
  }

  if (CONFIG_FILES.has(baseName) || CONFIG_FILES.has(lower)) {
    return 'config';
  }

  if (
    segments.includes('docs') ||
    lower === 'readme.md' ||
    lower.startsWith('readme.') ||
    lower.startsWith('license') ||
    DOC_EXTENSIONS.has(extension)
  ) {
    return 'docs';
  }

  if (SOURCE_EXTENSIONS.has(extension)) {
    return 'source';
  }

  return 'other';
}

/**
 * Builds Markdown for a compact repository navigation map.
 * @param {string[]} files - Repository-relative file paths.
 * @returns {string} Markdown map.
 */
export function buildMapMarkdown(files) {
  const maxFilesPerRole = DEFAULT_MAX_FILES_PER_ROLE;
  const grouped = ROLE_ORDER.reduce((accumulator, role) => {
    accumulator[role] = [];
    return accumulator;
  }, {});

  for (const filePath of files) {
    grouped[classifyFileRole(filePath)].push(normalizePath(filePath));
  }

  const lines = [
    '# Repository Map',
    '',
    'Heuristic note: roles are inferred from paths, filenames, and extensions; verify boundaries before relying on this map for ownership decisions.'
  ];

  for (const role of ROLE_ORDER) {
    const roleFiles = grouped[role].sort();
    lines.push('', `## ${role} (${roleFiles.length} ${roleFiles.length === 1 ? 'file' : 'files'})`);

    if (roleFiles.length === 0) {
      lines.push('- No files detected');
    } else {
      const visibleFiles = roleFiles.slice(0, maxFilesPerRole);
      lines.push(...visibleFiles.map(filePath => `- ${filePath}`));

      if (roleFiles.length > maxFilesPerRole) {
        lines.push(`- ... and ${roleFiles.length - maxFilesPerRole} more`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Traverses a repository and builds a compact navigation map.
 * @param {string} cwd - Directory to inspect.
 * @returns {Promise<{files: string[], markdown: string}>} Map result.
 */
export async function buildMap(cwd = process.cwd()) {
  const originalLog = console.log;

  console.log = () => {};
  let files;

  try {
    files = await getFiles({
      useConfig: false,
      excludeLarge: true,
      maxFileSize: MAP_MAX_FILE_SIZE
    }, cwd);
  } finally {
    console.log = originalLog;
  }

  return {
    files,
    markdown: buildMapMarkdown(files)
  };
}
