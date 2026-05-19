import { detectProject } from '../project/detect.js';

function formatList(items, fallback) {
  if (!items || items.length === 0) {
    return `- ${fallback}`;
  }

  return items.map(item => `- ${item}`).join('\n');
}

function formatCommands(project) {
  const scripts = project.scripts || {};
  const scriptEntries = Object.entries(scripts);

  if (scriptEntries.length === 0) {
    return '- No package scripts were detected.';
  }

  const runner = project.packageManager || 'npm';
  return scriptEntries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, command]) => `- \`${runner} run ${name}\` - \`${command}\``)
    .join('\n');
}

function formatTestingNotes(project) {
  const notes = [];
  const scripts = project.scripts || {};

  if (scripts.test) {
    const runner = project.packageManager || 'npm';
    notes.push(`- Test command: \`${runner} test\` (\`${scripts.test}\`).`);
  } else {
    notes.push('- No test script was detected.');
  }

  notes.push(project.hasTests
    ? '- Test files were detected in the repository.'
    : '- No test files were detected in the repository scan.');

  return notes.join('\n');
}

function formatWarnings(project) {
  if (!project.warnings || project.warnings.length === 0) {
    return '';
  }

  return `\n## Warnings\n${formatList(project.warnings, 'No warnings detected.')}\n`;
}

export function buildAgentsMarkdown(project) {
  const lines = [
    '# AGENTS.md',
    '',
    '## Project Overview',
    `- Name: ${project.name}`,
    `- Module type: ${project.moduleType || 'commonjs'}`,
    `- Package manager: ${project.packageManager || 'not detected'}`,
    `- Languages: ${project.languages && project.languages.length > 0 ? project.languages.join(', ') : 'not detected'}`,
    `- Files scanned: ${project.fileCount ?? 'not detected'}`,
    '',
    '## Commands',
    formatCommands(project),
    '',
    '## Structure and Key Files',
    formatList(project.keyFiles, 'No known key files were detected.'),
    '',
    '## Testing Notes',
    formatTestingNotes(project)
  ];

  const warnings = formatWarnings(project);
  if (warnings) {
    lines.push(warnings.trimEnd());
  }

  return `${lines.join('\n')}\n`;
}

export function buildClaudeMarkdown() {
  return '# CLAUDE.md\n\n@AGENTS.md\n';
}

export async function buildAgentDocs(cwd = process.cwd()) {
  const originalLog = console.log;
  console.log = () => {};

  let project;
  try {
    project = await detectProject(cwd);
  } finally {
    console.log = originalLog;
  }

  return {
    agents: buildAgentsMarkdown(project),
    claude: buildClaudeMarkdown(),
    project
  };
}
