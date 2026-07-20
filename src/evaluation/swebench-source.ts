import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { ContextPackError } from "../errors.js";

export interface SweBenchRow {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  patch: string;
  issue_url?: string | null;
  pr_url?: string | null;
  created_at?: string | null;
}

const stringValue = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContextPackError(`SWE-bench row has an invalid ${field}.`, 3, "INVALID_DATASET");
  }
  return value;
};

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

export const asSweBenchRow = (value: Record<string, unknown>): SweBenchRow => ({
  instance_id: stringValue(value.instance_id, "instance_id"),
  repo: stringValue(value.repo, "repo"),
  base_commit: stringValue(value.base_commit, "base_commit"),
  problem_statement: stringValue(value.problem_statement, "problem_statement"),
  patch: stringValue(value.patch, "patch"),
  issue_url: optionalString(value.issue_url),
  pr_url: optionalString(value.pr_url),
  created_at: optionalString(value.created_at),
});

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

export const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const downloadPinnedFile = async (url: string, target: string): Promise<void> => {
  let lastError = "unknown network error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "contextpack-benchmark" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const temporary = `${target}.part`;
      await fs.writeFile(temporary, bytes);
      await fs.rm(target, { force: true });
      await fs.rename(temporary, target);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  await fs.rm(`${target}.part`, { force: true });
  throw new ContextPackError(
    `Dataset download failed after 3 attempts: ${lastError}. Set HF_ENDPOINT if an approved mirror is required.`,
    3,
    "DATASET_DOWNLOAD_FAILED",
  );
};

export const readSweBenchRows = async (parquetPath: string): Promise<Array<Record<string, unknown>>> => {
  const file = await asyncBufferFromFile(parquetPath);
  return parquetReadObjects({
    file,
    columns: [
      "instance_id",
      "repo",
      "base_commit",
      "problem_statement",
      "patch",
      "issue_url",
      "pr_url",
      "created_at",
    ],
  });
};
