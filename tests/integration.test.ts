import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeTask } from "../src/analysis/analyze.js";
import { renderContext } from "../src/output/markdown.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("task analysis", () => {
  it("builds a bounded, explainable context pack without Git history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-fixture-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest", typecheck: "tsc --noEmit" }, devDependencies: { typescript: "5" } }));
    await fs.writeFile(path.join(root, "src", "auth.ts"), "export function loginWithGithub(user: string) { return { user }; }\n");
    await fs.writeFile(path.join(root, "src", "auth.test.ts"), "import { loginWithGithub } from './auth';\ntest('login', () => loginWithGithub('a'));\n");
    await fs.writeFile(path.join(root, ".env"), "API_KEY=should-not-appear\n");
    const manifest = await analyzeTask({ root, task: "add GitHub login", budget: 4000, historyCount: 50 });
    const markdown = renderContext(manifest);
    expect(manifest.candidates[0]?.path).toBe("src/auth.ts");
    expect(manifest.selected.some((item) => item.path === "src/auth.test.ts")).toBe(true);
    expect(manifest.warnings.some((item) => item.code === "NO_GIT_REPOSITORY")).toBe(true);
    expect(markdown).not.toContain("should-not-appear");
    expect(manifest.budget.estimatedTokens).toBeLessThanOrEqual(4200);
    for (let section = 1; section <= 10; section += 1) expect(markdown).toContain(`## ${section}.`);
  });
});
