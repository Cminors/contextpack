import { toPosixPath } from "../utils/path.js";
import type { GoldPatchRegion } from "./issue-types.js";

export interface ExcludedPatchFile {
  path: string;
  reason: "new-file" | "unsupported-file" | "no-old-side-hunk";
}

export interface PatchRegionResult {
  regions: GoldPatchRegion[];
  excludedFiles: ExcludedPatchFile[];
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/i;
const HUNK_HEADER = /^@@ -(?<start>\d+)(?:,(?<count>\d+))? \+\d+(?:,\d+)? @@/;

function unquoteGitPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.slice(1, trimmed.endsWith('"') ? -1 : undefined);
  }
}

function patchPath(line: string): string | null {
  const raw = unquoteGitPath(line.slice(4).split("\t", 1)[0] ?? "");
  if (!raw || raw === "/dev/null") return null;
  const normalized = toPosixPath(raw.replace(/^[ab]\//, ""));
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  return normalized;
}

function pushExcluded(
  excluded: ExcludedPatchFile[],
  path: string,
  reason: ExcludedPatchFile["reason"],
): void {
  if (!excluded.some((item) => item.path === path && item.reason === reason)) excluded.push({ path, reason });
}

/**
 * Converts unified-diff hunks into regions on the pre-change checkout.
 * The complete old-side hunk is the gold region because it contains both the
 * changed lines and the surrounding context available at base_commit. An
 * insertion-only hunk is anchored to one existing line at the insertion site.
 */
export function parsePatchRegions(patch: string): PatchRegionResult {
  const regions: GoldPatchRegion[] = [];
  const excludedFiles: ExcludedPatchFile[] = [];
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let oldPathWasNull = false;
  let sawHunk = false;

  const finishFile = (): void => {
    const candidate = oldPath ?? newPath;
    if (!candidate || sawHunk) return;
    if (oldPathWasNull) pushExcluded(excludedFiles, candidate, "new-file");
    else if (!SOURCE_FILE.test(candidate)) pushExcluded(excludedFiles, candidate, "unsupported-file");
    else pushExcluded(excludedFiles, candidate, "no-old-side-hunk");
  };

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      oldPath = null;
      newPath = null;
      oldPathWasNull = false;
      sawHunk = false;
      continue;
    }
    if (line.startsWith("--- ")) {
      oldPathWasNull = line.slice(4).trim() === "/dev/null";
      oldPath = patchPath(line);
      continue;
    }
    if (line.startsWith("+++ ")) {
      newPath = patchPath(line);
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (!hunk) continue;
    sawHunk = true;
    const candidate = oldPath ?? newPath;
    if (!candidate) continue;
    if (oldPathWasNull) {
      pushExcluded(excludedFiles, candidate, "new-file");
      continue;
    }
    if (!SOURCE_FILE.test(candidate)) {
      pushExcluded(excludedFiles, candidate, "unsupported-file");
      continue;
    }
    const start = Number.parseInt(hunk.groups?.start ?? "0", 10);
    const count = Number.parseInt(hunk.groups?.count ?? "1", 10);
    const startLine = Math.max(1, start);
    const endLine = count === 0 ? startLine : startLine + count - 1;
    regions.push({ path: candidate, startLine, endLine, kind: "patch-hunk" });
  }
  finishFile();

  regions.sort((left, right) => left.path.localeCompare(right.path) || left.startLine - right.startLine);
  return { regions, excludedFiles };
}
