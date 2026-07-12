import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { RuleRecord } from "../types.js";
import { relativePosix, toPosixPath } from "../utils/path.js";

function cursorGlobs(content: string): string[] {
  if (!content.startsWith("---")) {
    return [];
  }

  const end = content.indexOf("\n---", 3);
  if (end < 0) {
    return [];
  }

  const frontmatter = content.slice(3, end);
  const match = frontmatter.match(/^globs:\s*(.+)$/m);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .replace(/[\[\]"']/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function discoverRules(root: string): Promise<RuleRecord[]> {
  const paths = await fg(
    [
      "AGENTS.md",
      "**/AGENTS.md",
      "CLAUDE.md",
      "**/CLAUDE.md",
      ".github/copilot-instructions.md",
      ".cursor/rules/*.mdc",
      "README.md",
      "CONTRIBUTING.md",
      "**/README.md",
      "**/CONTRIBUTING.md",
    ],
    {
      cwd: root,
      onlyFiles: true,
      unique: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"],
    },
  );

  const rules: RuleRecord[] = [];
  for (const relativePath of paths.sort()) {
    const absolutePath = path.join(root, relativePath);
    const content = await fs.readFile(absolutePath, "utf8");
    const normalized = toPosixPath(relativePath);
    const basename = path.posix.basename(normalized);
    const kind: RuleRecord["kind"] =
      basename === "AGENTS.md"
        ? "agents"
        : basename === "CLAUDE.md"
          ? "claude"
          : normalized === ".github/copilot-instructions.md"
            ? "copilot"
            : normalized.startsWith(".cursor/rules/")
              ? "cursor"
              : "documentation";

    rules.push({
      path: normalized,
      scopeDirectory:
        kind === "cursor" || kind === "copilot" ? "." : relativePosix(root, path.dirname(absolutePath)) || ".",
      globs: kind === "cursor" ? cursorGlobs(content) : [],
      content,
      kind,
    });
  }

  return rules;
}
