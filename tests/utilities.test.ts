import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContextPackError, toContextPackError } from "../src/errors.js";
import { commonDirectory, isWithinRoot, relativePosix, toPosixPath } from "../src/utils/path.js";
import { extractConventionalScope, lexicalMatch, normalizeTaskTerms } from "../src/utils/task-terms.js";
import { countTokens } from "../src/output/tokens.js";
import { writeArtifacts } from "../src/output/write.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("utility contracts", () => {
  it("normalizes English, camel case, and Chinese aliases", () => {
    const terms = normalizeTaskTerms("给登录模块增加 GitHub OAuth");
    expect(terms).toContain("login");
    expect(terms).toContain("auth");
    expect(terms).toContain("oauth");
    expect(lexicalMatch(terms, "src/auth/loginWithGithub.ts")).toBeGreaterThan(0.5);
    expect(lexicalMatch([], "anything")).toBe(0);
    const conventional = normalizeTaskTerms("feat(server): add OAuth discovery (#123)");
    expect(conventional).toEqual(expect.arrayContaining(["auth", "authorization", "discovery", "metadata", "oauth", "server"]));
    expect(conventional).not.toContain("feat");
    expect(conventional).not.toContain("123");
    expect(extractConventionalScope("feat(server): add OAuth")).toBe("server");
    expect(extractConventionalScope("add OAuth")).toBeNull();
  });

  it("removes issue-template comments, links, and URLs before extracting terms", () => {
    const terms = normalizeTaskTerms([
      "TimeoutErrorMessage does not work",
      "<!-- Please read https://example.com/docs before submitting an issue -->",
      "Expected custom timeout message",
      "![screenshot](https://example.com/image.png)",
    ].join("\n"));
    expect(terms).toEqual(expect.arrayContaining(["timeout", "error", "message", "custom"]));
    expect(terms).not.toEqual(expect.arrayContaining(["please", "read", "submitting", "https", "example"]));
  });

  it("handles repository-relative paths", () => {
    const root = path.resolve("project");
    expect(toPosixPath("src\\auth.ts")).toBe("src/auth.ts");
    expect(toPosixPath("packages\\web/src\\auth.ts")).toBe("packages/web/src/auth.ts");
    expect(relativePosix(root, path.join(root, "src", "auth.ts"))).toBe("src/auth.ts");
    expect(isWithinRoot(root, path.join(root, "src"))).toBe(true);
    expect(isWithinRoot(root, path.resolve("elsewhere"))).toBe(false);
    expect(commonDirectory(["packages/web/a.ts", "packages/web/b.ts"])).toBe("packages/web");
    expect(commonDirectory([])).toBe(".");
  });

  it("preserves typed errors and wraps unknown failures", () => {
    const typed = new ContextPackError("bad input", 1, "BAD");
    expect(toContextPackError(typed)).toBe(typed);
    expect(toContextPackError(new Error("boom"))).toMatchObject({ exitCode: 3, code: "ANALYSIS_FAILED" });
  });

  it("counts tokens and writes artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-output-"));
    created.push(root);
    expect(countTokens("hello context")).toBeGreaterThan(0);
    await writeArtifacts(path.join(root, "nested"), { "a.md": "hello" });
    expect(await fs.readFile(path.join(root, "nested", "a.md"), "utf8")).toBe("hello");
  });
});
