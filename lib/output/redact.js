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
  if (isSensitiveFile(filePath)) {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('.env') ? '[REDACTED: dotenv file]' : '[REDACTED: sensitive file]';
  }
  return redactContent(content);
}
