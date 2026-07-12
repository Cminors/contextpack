import path from "node:path";

const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
]);

const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".keystore"]);

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i,
];

export function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(basename);

  return (
    SENSITIVE_BASENAMES.has(basename) ||
    basename.startsWith(".env.") ||
    SENSITIVE_EXTENSIONS.has(extension) ||
    normalized.includes("/.ssh/") ||
    normalized.includes("/secrets/")
  );
}

export function containsLikelySecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}
