import { getFiles } from '../traverse.js';
import { buildBrief } from './brief.js';

const TASK_CONTEXT_MAX_FILE_SIZE = 256 * 1024;
const DEFAULT_MAX_FILES = 20;
const TASK_STOP_WORDS = new Set(['fix', 'add', 'the', 'and', 'for', 'with']);
const PROJECT_CONTEXT_PATTERN = /(^|\/)(package\.json|jest\.config\.(js|cjs|mjs)|tsconfig\.json|README\.md)$/u;
const TEST_FILE_PATTERN = /(^|\/)(test|tests)\/|(\.test\.|\.spec\.)/u;

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function termsFromTask(task) {
  return String(task)
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(term => term.length >= 3 && !TASK_STOP_WORDS.has(term));
}

/**
 * Selects repository files that are likely useful for a task-focused prompt.
 * @param {string} task - User task description.
 * @param {string[]} files - Repository-relative file paths.
 * @param {Object} options - Selection options.
 * @param {number} [options.maxFiles=20] - Maximum selected files.
 * @returns {{file: string, reason: string}[]} Selected files with reasons.
 */
export function selectTaskFiles(task, files, options = {}) {
  const terms = termsFromTask(task);
  const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
  const taskMatches = new Map();
  const projectContext = new Map();
  const relevantTests = new Map();

  function add(bucket, file, reason) {
    if (!bucket.has(file)) {
      bucket.set(file, { file, reason });
    }
  }

  for (const file of files) {
    const normalized = normalizePath(file).toLowerCase();

    for (const term of terms) {
      if (normalized.includes(term)) {
        add(taskMatches, file, `matched task term "${term}"`);
      }
    }
  }

  for (const file of files) {
    if (PROJECT_CONTEXT_PATTERN.test(normalizePath(file))) {
      add(projectContext, file, 'included as project context');
    }
  }

  for (const file of files) {
    const normalized = normalizePath(file).toLowerCase();

    if (TEST_FILE_PATTERN.test(normalized) && terms.some(term => normalized.includes(term))) {
      const taskMatch = taskMatches.get(file);
      add(relevantTests, file, taskMatch?.reason || 'included as relevant test file');
    }
  }

  const selected = new Map();

  for (const bucket of [projectContext, relevantTests, taskMatches]) {
    for (const item of bucket.values()) {
      if (!selected.has(item.file)) {
        selected.set(item.file, item);
      }
    }
  }

  return Array.from(selected.values()).slice(0, maxFiles);
}

/**
 * Renders a task-focused context summary as Markdown.
 * @param {string} task - User task description.
 * @param {{file: string, reason: string}[]} selectedFiles - Selected files.
 * @param {string} briefMarkdown - Repository brief Markdown.
 * @returns {string} Markdown context.
 */
export function buildTaskContextMarkdown(task, selectedFiles, briefMarkdown) {
  const lines = [
    '# Task Context',
    '',
    `Task: ${task}`,
    '',
    briefMarkdown.trim(),
    '',
    '## Selected Files'
  ];

  if (selectedFiles.length === 0) {
    lines.push('- No task-specific files selected');
  } else {
    for (const item of selectedFiles) {
      lines.push(`- \`${item.file}\`: ${item.reason}`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

/**
 * Builds task-focused repository context.
 * @param {string} task - User task description.
 * @param {string} cwd - Repository directory.
 * @returns {Promise<{files: {file: string, reason: string}[], markdown: string}>} Context result.
 */
export async function buildTaskContext(task, cwd = process.cwd()) {
  const originalLog = console.log;

  console.log = () => {};
  let files;

  try {
    files = await getFiles({
      useConfig: false,
      excludeLarge: true,
      maxFileSize: TASK_CONTEXT_MAX_FILE_SIZE
    }, cwd);
  } finally {
    console.log = originalLog;
  }

  const brief = await buildBrief(cwd, { useConfig: false });
  const selectedFiles = selectTaskFiles(task, files);

  return {
    files: selectedFiles,
    markdown: buildTaskContextMarkdown(task, selectedFiles, brief.markdown)
  };
}
