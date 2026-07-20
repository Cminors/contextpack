import fs from "node:fs/promises";
import path from "node:path";
import { ContextPackError } from "../errors.js";
import type { IssueBenchmarkInstance, IssueBenchmarkLanguage } from "./issue-types.js";

export const isIssueBenchmarkLanguage = (value: unknown): value is IssueBenchmarkLanguage =>
  value === "javascript-typescript" || value === "python";

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isIssueInstance = (value: unknown): value is IssueBenchmarkInstance => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<IssueBenchmarkInstance>;
  const metadata = item.metadata as Partial<IssueBenchmarkInstance["metadata"]> | null | undefined;
  return typeof item.instanceId === "string" && item.instanceId.length > 0
    && typeof item.sourceDataset === "string" && item.sourceDataset.length > 0
    && typeof item.sourceRevision === "string" && item.sourceRevision.length > 0
    && typeof item.repo === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repo)
    && /^[0-9a-f]{7,40}$/i.test(item.baseCommit ?? "")
    && typeof item.issueText === "string" && item.issueText.trim().length > 0
    && isIssueBenchmarkLanguage(item.language)
    && Array.isArray(item.goldRegions) && item.goldRegions.length > 0
    && item.goldRegions.every((region) => region !== null
      && typeof region === "object"
      && typeof region.path === "string"
      && region.path.length > 0
      && !region.path.startsWith("/")
      && !region.path.split("/").includes("..")
      && Number.isInteger(region.startLine) && region.startLine > 0
      && Number.isInteger(region.endLine) && region.endLine >= region.startLine
      && region.kind === "patch-hunk")
    && metadata !== null
    && metadata !== undefined
    && isNullableString(metadata.issueUrl)
    && isNullableString(metadata.prUrl)
    && isNullableString(metadata.createdAt)
    && typeof metadata.patchSha256 === "string" && /^[0-9a-f]{64}$/i.test(metadata.patchSha256)
    && Number.isInteger(metadata.excludedPatchFiles) && (metadata.excludedPatchFiles ?? -1) >= 0;
};

export async function readIssueDataset(filePath: string): Promise<IssueBenchmarkInstance[]> {
  const content = await fs.readFile(path.resolve(filePath), "utf8");
  const instances: IssueBenchmarkInstance[] = [];
  const seenIds = new Set<string>();
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ContextPackError(`Invalid JSONL at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    if (!isIssueInstance(parsed) || seenIds.has(parsed.instanceId)) {
      throw new ContextPackError(`Invalid issue instance at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    seenIds.add(parsed.instanceId);
    instances.push(parsed);
  }
  if (instances.length === 0) throw new ContextPackError("Issue dataset is empty.", 2, "INVALID_DATASET");
  return instances;
}
