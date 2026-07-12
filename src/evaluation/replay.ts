import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EvaluationReport, EvaluationSkip, GitCommitRecord } from "../types.js";
import { ContextPackError } from "../errors.js";
import { analyzeTask } from "../analysis/analyze.js";
import { discoverRepository } from "../repository/discover.js";
import { gitStatusFingerprint, runGit } from "../utils/git.js";
import { toPosixPath } from "../utils/path.js";
import { aggregateMetrics, commitMetrics } from "./metrics.js";
import { renderContext } from "../output/markdown.js";

const SOURCE = /\.[cm]?[jt]sx?$/i;
const SKIP_TITLE = /\b(?:release|version|bump|deps?|dependencies|lockfile|format(?:ting)?|lint fixes?)\b/i;
const FEATURE_TITLE = /^(?:feat(?:ure)?(?:\([^)]*\))?!?:|add\b|implement\b|introduce\b|support\b)/i;
const MARKER = "---CONTEXTPACK-EVAL---";

function listCommits(root: string, count: number): GitCommitRecord[] {
  const result = runGit(root, ["log", "--no-merges", `-n${Math.max(count * 20, count)}`, "--name-only", `--format=${MARKER}%H%x09%P%x09%s`]);
  if (!result.ok) throw new ContextPackError(`Cannot read Git history: ${result.stderr}`, 3, "GIT_HISTORY_FAILED");
  const records: GitCommitRecord[] = [];
  let current: (GitCommitRecord & { parents: string[] }) | null = null;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith(MARKER)) {
      if (current) records.push(current);
      const [hash = "", parents = "", ...title] = line.slice(MARKER.length).split("\t");
      current = { hash, title: title.join("\t"), files: [], parents: parents.split(" ").filter(Boolean) };
    } else if (current && line.trim()) {
      const file = toPosixPath(line.trim());
      if (SOURCE.test(file)) current.files.push(file);
    }
  }
  if (current) records.push(current);
  return records;
}

export async function runReplay(root: string, requestedCommits: number, budget: number): Promise<EvaluationReport> {
  const repository = await discoverRepository(root);
  if (!repository.snapshot.isGitRepository) throw new ContextPackError("Historical replay requires a Git repository.", 2, "GIT_REQUIRED");
  const originalFingerprint = gitStatusFingerprint(repository.snapshot.root);
  const results: EvaluationReport["results"] = [];
  const skipped: EvaluationSkip[] = [];
  const commits = listCommits(repository.snapshot.root, requestedCommits);

  for (const commit of commits) {
    if (results.length >= requestedCommits) break;
    const parent = runGit(repository.snapshot.root, ["rev-parse", `${commit.hash}^`]);
    const unique = [...new Set(commit.files)];
    let reason: string | null = null;
    if (!parent.ok) reason = "commit has no replayable parent";
    else if (SKIP_TITLE.test(commit.title)) reason = "mechanical, release, or dependency commit";
    else if (!FEATURE_TITLE.test(commit.title)) reason = "outside the feature-addition task scope";
    else if (unique.length < 1 || unique.length > 15) reason = "outside the 1-15 source-file feature scope";
    if (reason) {
      skipped.push({ hash: commit.hash, title: commit.title, reason });
      continue;
    }

    const goldFiles = unique.filter((file) => runGit(repository.snapshot.root, ["cat-file", "-e", `${parent.stdout}:${file}`]).ok);
    if (goldFiles.length === 0) {
      skipped.push({ hash: commit.hash, title: commit.title, reason: "all changed source files were newly added" });
      continue;
    }

    const base = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-"));
    let attached = false;
    try {
      const add = runGit(repository.snapshot.root, ["worktree", "add", "--detach", base, parent.stdout]);
      if (!add.ok) throw new Error(add.stderr || "worktree creation failed");
      attached = true;
      const started = performance.now();
      const manifest = await analyzeTask({ root: base, task: commit.title, budget, historyCount: 500 });
      renderContext(manifest);
      const durationMs = Math.round(performance.now() - started);
      const predictions = manifest.candidates.slice(0, 20).map((item) => item.path);
      results.push({
        hash: commit.hash,
        title: commit.title,
        goldFiles,
        predictions,
        ...commitMetrics(goldFiles, predictions),
        estimatedTokens: manifest.budget.estimatedTokens,
        durationMs,
      });
    } catch (error) {
      skipped.push({ hash: commit.hash, title: commit.title, reason: `replay failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      if (attached) runGit(repository.snapshot.root, ["worktree", "remove", "--force", base]);
      await fs.rm(base, { recursive: true, force: true });
    }
  }

  if (gitStatusFingerprint(repository.snapshot.root) !== originalFingerprint) {
    throw new ContextPackError("Evaluation stopped because the user workspace fingerprint changed.", 3, "WORKSPACE_CHANGED");
  }
  if (results.length === 0) throw new ContextPackError("No valid historical commits were available for replay.", 4, "NO_VALID_COMMITS");
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    repository: repository.snapshot,
    requestedCommits,
    validCommits: results.length,
    results,
    skipped,
    aggregate: aggregateMetrics(results),
    limitations: [
      "Changed files are an imperfect proxy for the ideal context set.",
      "Commit titles can underspecify the original feature task.",
      "Retrieval recall does not measure whether a Coding Agent completes the task successfully.",
    ],
  };
}
