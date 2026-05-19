function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderAttributes(attributes = {}) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  return ' ' + entries
    .map(([key, value]) => `${escapeXml(key)}="${escapeXml(value)}"`)
    .join(' ');
}

export function renderSection(name, content, options = {}) {
  const { format = 'text', attributes = {} } = options;

  if (format === 'json') {
    return JSON.stringify({ type: name, attributes, content }) + '\n';
  }

  if (format === 'xml') {
    return `<${escapeXml(name)}${renderAttributes(attributes)}>${escapeXml(content)}</${escapeXml(name)}>\n`;
  }

  if (format === 'markdown') {
    return `## ${name}\n\n${content}\n`;
  }

  return `--- ${name} ---\n${content}\n`;
}
