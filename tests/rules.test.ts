import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverRules } from "../src/repository/rules.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("repository rules", () => {
  it("classifies supported instructions and extracts Cursor globs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-rules-"));
    created.push(root);
    await fs.mkdir(path.join(root, "packages", "web"), { recursive: true });
    await fs.mkdir(path.join(root, ".cursor", "rules"), { recursive: true });
    await fs.mkdir(path.join(root, ".github"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "Root instructions");
    await fs.writeFile(path.join(root, "packages", "web", "CLAUDE.md"), "Package instructions");
    await fs.writeFile(path.join(root, ".github", "copilot-instructions.md"), "Copilot instructions");
    await fs.writeFile(path.join(root, ".cursor", "rules", "react.mdc"), "---\nglobs: [\"**/*.tsx\", '**/*.ts']\n---\nUse components");
    await fs.writeFile(path.join(root, "README.md"), "Docs");
    const rules = await discoverRules(root);
    expect(rules.map((item) => item.kind).sort()).toEqual(["agents", "claude", "copilot", "cursor", "documentation"]);
    expect(rules.find((item) => item.kind === "cursor")?.globs).toEqual(["**/*.tsx", "**/*.ts"]);
    expect(rules.find((item) => item.kind === "claude")?.scopeDirectory).toBe("packages/web");
  });

  it("treats malformed Cursor frontmatter as unscoped", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-rules-"));
    created.push(root);
    await fs.mkdir(path.join(root, ".cursor", "rules"), { recursive: true });
    await fs.writeFile(path.join(root, ".cursor", "rules", "plain.mdc"), "No frontmatter");
    expect((await discoverRules(root))[0]?.globs).toEqual([]);
  });
});
