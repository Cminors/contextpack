import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReplay } from "../src/evaluation/replay.js";
import { gitStatusFingerprint } from "../src/utils/git.js";

const created: string[] = [];
const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
};

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, { recursive: true, force: true }))));

describe("historical replay", () => {
  it("uses a detached worktree and preserves the current workspace", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-replay-"));
    created.push(root);
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "contextpack@example.test"]);
    git(root, ["config", "user.name", "ContextPack Test"]);
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    await fs.writeFile(path.join(root, "auth.ts"), "export function login() { return false; }\n");
    git(root, ["add", "."]); git(root, ["commit", "-qm", "initial auth module"]);
    await fs.writeFile(path.join(root, "auth.ts"), "export function loginWithGithub() { return true; }\n");
    git(root, ["add", "."]); git(root, ["commit", "-qm", "add GitHub login"]);
    const before = gitStatusFingerprint(root);
    const report = await runReplay(root, 1, 4000);
    expect(report.validCommits).toBe(1);
    expect(report.aggregate.recallAt5).toBe(1);
    expect(gitStatusFingerprint(root)).toBe(before);
  }, 30_000);
});
