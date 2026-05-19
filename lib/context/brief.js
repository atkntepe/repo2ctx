import { detectProject } from '../project/detect.js';

const DEFAULT_DESCRIPTION = 'Prepare safe, task-focused repository context for AI coding agents';

function formatValue(value, fallback = 'Not detected') {
  return value || fallback;
}

function formatList(items, fallback) {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }

  return items.map(item => `- ${item}`);
}

function formatScripts(scripts = {}) {
  const entries = Object.entries(scripts);

  if (entries.length === 0) {
    return ['- No scripts detected'];
  }

  return entries.map(([name, command]) => `- ${name}: \`${command}\``);
}

/**
 * Builds a compact Markdown brief from detected project metadata.
 * @param {Object} project - Project metadata from detectProject.
 * @returns {string} Markdown brief.
 */
export function buildBriefMarkdown(project) {
  const warnings = project.warnings || [];
  const lines = [
    '# repo2ctx Brief',
    '',
    project.description || DEFAULT_DESCRIPTION,
    '',
    '## Project',
    `- Name: ${formatValue(project.name)}`,
    `- Package manager: ${formatValue(project.packageManager)}`,
    `- Module type: ${formatValue(project.moduleType)}`,
    `- Files scanned: ${project.fileCount ?? 'Unknown'}`,
    `- Tests detected: ${project.hasTests ? 'yes' : 'no'}`,
    '',
    '## Languages',
    ...formatList(project.languages, 'No languages detected'),
    '',
    '## Scripts',
    ...formatScripts(project.scripts),
    '',
    '## Key Files',
    ...formatList(project.keyFiles, 'No key files detected')
  ];

  if (warnings.length > 0) {
    lines.push(
      '',
      '## Health',
      ...warnings.map(warning => `- ${warning}`)
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Detects repository metadata and returns a compact brief.
 * @param {string} cwd - Directory to inspect.
 * @param {Object} options - Brief options.
 * @param {boolean} [options.useConfig=true] - Whether to inherit generation config filters.
 * @returns {Promise<{project: Object, markdown: string}>} Brief result.
 */
export async function buildBrief(cwd = process.cwd(), options = {}) {
  const { useConfig = true } = options;
  const originalLog = console.log;

  console.log = () => {};
  let project;

  try {
    project = await detectProject(cwd, { useConfig });
  } finally {
    console.log = originalLog;
  }

  return {
    project,
    markdown: buildBriefMarkdown(project)
  };
}
