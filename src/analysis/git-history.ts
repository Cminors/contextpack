import type { GitCommitRecord, GitHistoryIndex } from "../types.js";
import { runGit } from "../utils/git.js";
import { toPosixPath } from "../utils/path.js";
import { normalizeTaskTerms } from "../utils/task-terms.js";

const SENTINEL = "---CONTEXTPACK-COMMIT---";

function parseLog(output: string, supportedFiles: Set<string>): GitCommitRecord[] {
  const records: GitCommitRecord[] = [];
  let current: GitCommitRecord | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith(SENTINEL)) {
      if (current && current.files.length > 0) records.push(current);
      const payload = line.slice(SENTINEL.length);
      const [hash = "", ...titleParts] = payload.split("\t");
      current = { hash, title: titleParts.join("\t"), files: [] };
    } else if (current && line.trim()) {
      const filePath = toPosixPath(line.trim());
      if (supportedFiles.has(filePath)) current.files.push(filePath);
    }
  }
  if (current && current.files.length > 0) records.push(current);
  return records;
}

export function emptyGitHistory(): GitHistoryIndex {
  return {
    commits: [],
    fileCommitCounts: new Map(),
    coChange: new Map(),
    titleTermsByFile: new Map(),
  };
}

export function buildGitHistoryIndex(commits: GitCommitRecord[]): GitHistoryIndex {
  const fileCommitCounts = new Map<string, number>();
  const pairCounts = new Map<string, Map<string, number>>();
  const titleTermsByFile = new Map<string, Set<string>>();

  for (const commit of commits) {
    const files = [...new Set(commit.files)].slice(0, 50);
    const titleTerms = normalizeTaskTerms(commit.title);
    for (const file of files) {
      fileCommitCounts.set(file, (fileCommitCounts.get(file) ?? 0) + 1);
      const terms = titleTermsByFile.get(file) ?? new Set<string>();
      titleTerms.forEach((term) => terms.add(term));
      titleTermsByFile.set(file, terms);
    }
    for (let left = 0; left < files.length; left += 1) {
      for (let right = left + 1; right < files.length; right += 1) {
        const a = files[left];
        const b = files[right];
        if (!a || !b) continue;
        const aMap = pairCounts.get(a) ?? new Map<string, number>();
        const bMap = pairCounts.get(b) ?? new Map<string, number>();
        aMap.set(b, (aMap.get(b) ?? 0) + 1);
        bMap.set(a, (bMap.get(a) ?? 0) + 1);
        pairCounts.set(a, aMap);
        pairCounts.set(b, bMap);
      }
    }
  }

  const coChange = new Map<string, Map<string, number>>();
  for (const [file, pairs] of pairCounts) {
    const normalized = new Map<string, number>();
    for (const [other, count] of pairs) {
      const denominator = Math.sqrt((fileCommitCounts.get(file) ?? 1) * (fileCommitCounts.get(other) ?? 1));
      normalized.set(other, Math.min(1, count / denominator));
    }
    coChange.set(file, normalized);
  }

  return { commits, fileCommitCounts, coChange, titleTermsByFile };
}

export function readGitHistory(root: string, count: number, supportedFiles: Set<string>): GitHistoryIndex {
  const result = runGit(root, [
    "log",
    "--no-merges",
    `-n${Math.max(1, count)}`,
    "--name-only",
    `--format=${SENTINEL}%H%x09%s`,
  ]);
  if (!result.ok || !result.stdout) return emptyGitHistory();
  return buildGitHistoryIndex(parseLog(result.stdout, supportedFiles));
}

export function coChangeStrength(history: GitHistoryIndex, left: string, right: string): number {
  return history.coChange.get(left)?.get(right) ?? 0;
}
