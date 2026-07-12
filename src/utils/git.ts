import { spawnSync } from "node:child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
}

export function runGit(root: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status ?? 1,
  };
}

export function findGitRoot(start: string): string | null {
  const result = runGit(start, ["rev-parse", "--show-toplevel"]);
  return result.ok && result.stdout ? result.stdout : null;
}

export function gitStatusFingerprint(root: string): string {
  const branch = runGit(root, ["branch", "--show-current"]);
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return JSON.stringify({
    branch: branch.stdout,
    head: head.stdout,
    status: status.stdout,
  });
}
