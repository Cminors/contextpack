import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { ContextPackError } from "../errors.js";
import type { IssueBenchmarkInstance } from "./issue-types.js";
import { parsePatchRegions } from "./patch-regions.js";

export const SWE_BENCH_MULTILINGUAL = {
  id: "SWE-bench/SWE-bench_Multilingual",
  revision: "2b7aced941b4873e9cad3e76abbae93f481d1beb",
  license: "MIT",
  split: "test",
  file: "data/test-00000-of-00001.parquet",
  parquetSha256: "28b7f874e48496399077d276f9f2b163a077ddf0a70dc507c148d58da826baa9",
  expectedJsTsInstances: 43,
} as const;

export const SWE_BENCH_JS_TS_REPOSITORIES = new Set([
  "axios/axios",
  "babel/babel",
  "facebook/docusaurus",
  "immutable-js/immutable-js",
  "mrdoob/three.js",
  "preactjs/preact",
  "vuejs/core",
]);

interface SweBenchRow {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  patch: string;
  issue_url?: string | null;
  pr_url?: string | null;
  created_at?: string | null;
}

export interface DatasetPreparationResult {
  outputPath: string;
  manifestPath: string;
  parquetPath: string;
  instances: number;
  excludedInstances: number;
  parquetSha256: string;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContextPackError(`SWE-bench row has an invalid ${field}.`, 3, "INVALID_DATASET");
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asSweBenchRow(value: Record<string, unknown>): SweBenchRow {
  return {
    instance_id: stringValue(value.instance_id, "instance_id"),
    repo: stringValue(value.repo, "repo"),
    base_commit: stringValue(value.base_commit, "base_commit"),
    problem_statement: stringValue(value.problem_statement, "problem_statement"),
    patch: stringValue(value.patch, "patch"),
    issue_url: optionalString(value.issue_url),
    pr_url: optionalString(value.pr_url),
    created_at: optionalString(value.created_at),
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function adaptSweBenchMultilingualRow(value: Record<string, unknown>): IssueBenchmarkInstance | null {
  const row = asSweBenchRow(value);
  if (!SWE_BENCH_JS_TS_REPOSITORIES.has(row.repo)) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(row.base_commit)) {
    throw new ContextPackError(`Invalid base_commit for ${row.instance_id}.`, 3, "INVALID_DATASET");
  }
  const parsed = parsePatchRegions(row.patch);
  if (parsed.regions.length === 0) return null;
  return {
    instanceId: row.instance_id,
    sourceDataset: SWE_BENCH_MULTILINGUAL.id,
    sourceRevision: SWE_BENCH_MULTILINGUAL.revision,
    repo: row.repo,
    baseCommit: row.base_commit,
    issueText: row.problem_statement.replace(/\r\n/g, "\n").trim(),
    language: "javascript-typescript",
    goldRegions: parsed.regions,
    metadata: {
      issueUrl: row.issue_url ?? null,
      prUrl: row.pr_url ?? null,
      createdAt: row.created_at ?? null,
      patchSha256: sha256(row.patch),
      excludedPatchFiles: parsed.excludedFiles.length,
    },
  };
}

export function adaptSweBenchMultilingualRows(rows: Array<Record<string, unknown>>): IssueBenchmarkInstance[] {
  return rows
    .flatMap((row) => {
      const instance = adaptSweBenchMultilingualRow(row);
      return instance ? [instance] : [];
    })
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}

async function download(url: string, target: string): Promise<void> {
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
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function prepareSweBenchMultilingual(
  outputPath: string,
  options: { force?: boolean; parquetPath?: string } = {},
): Promise<DatasetPreparationResult> {
  const resolvedOutput = path.resolve(outputPath);
  const directory = path.dirname(resolvedOutput);
  await fs.mkdir(directory, { recursive: true });
  const parquetPath = path.resolve(options.parquetPath ?? path.join(
    directory,
    `${SWE_BENCH_MULTILINGUAL.revision}.parquet`,
  ));
  const endpoint = (process.env.HF_ENDPOINT?.trim() || "https://huggingface.co").replace(/\/$/, "");
  const url = `${endpoint}/datasets/${SWE_BENCH_MULTILINGUAL.id}/resolve/${SWE_BENCH_MULTILINGUAL.revision}/${SWE_BENCH_MULTILINGUAL.file}`;
  if (options.force || !(await exists(parquetPath))) await download(url, parquetPath);

  const parquetBytes = await fs.readFile(parquetPath);
  const parquetSha256 = sha256(parquetBytes);
  if (parquetSha256 !== SWE_BENCH_MULTILINGUAL.parquetSha256) {
    throw new ContextPackError(
      `Dataset checksum mismatch: expected ${SWE_BENCH_MULTILINGUAL.parquetSha256}, received ${parquetSha256}.`,
      3,
      "DATASET_INTEGRITY_FAILED",
    );
  }
  const file = await asyncBufferFromFile(parquetPath);
  const rows = await parquetReadObjects({
    file,
    columns: ["instance_id", "repo", "base_commit", "problem_statement", "patch", "issue_url", "pr_url", "created_at"],
  });
  const instances = adaptSweBenchMultilingualRows(rows);
  if (instances.length !== SWE_BENCH_MULTILINGUAL.expectedJsTsInstances) {
    throw new ContextPackError(
      `Expected ${SWE_BENCH_MULTILINGUAL.expectedJsTsInstances} retrievable JS/TS instances, found ${instances.length}.`,
      3,
      "DATASET_DRIFT",
    );
  }

  if (options.force || !(await exists(resolvedOutput))) {
    await fs.writeFile(resolvedOutput, `${instances.map((instance) => JSON.stringify(instance)).join("\n")}\n`, "utf8");
  }
  const manifestPath = `${resolvedOutput}.manifest.json`;
  const manifest = {
    version: 1,
    sourceDataset: SWE_BENCH_MULTILINGUAL.id,
    sourceRevision: SWE_BENCH_MULTILINGUAL.revision,
    sourceFile: SWE_BENCH_MULTILINGUAL.file,
    sourceUrl: url,
    license: SWE_BENCH_MULTILINGUAL.license,
    split: SWE_BENCH_MULTILINGUAL.split,
    parquetSha256,
    totalRows: rows.length,
    jsTsInstances: instances.length,
    excludedInstances: rows.length - instances.length,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    outputPath: resolvedOutput,
    manifestPath,
    parquetPath,
    instances: instances.length,
    excludedInstances: rows.length - instances.length,
    parquetSha256,
  };
}

function isIssueInstance(value: unknown): value is IssueBenchmarkInstance {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<IssueBenchmarkInstance>;
  return typeof item.instanceId === "string"
    && typeof item.sourceDataset === "string"
    && typeof item.sourceRevision === "string"
    && typeof item.repo === "string"
    && /^[0-9a-f]{7,40}$/i.test(item.baseCommit ?? "")
    && typeof item.issueText === "string"
    && item.language === "javascript-typescript"
    && Array.isArray(item.goldRegions)
    && item.goldRegions.length > 0
    && item.goldRegions.every((region) =>
      typeof region.path === "string"
      && Number.isInteger(region.startLine)
      && Number.isInteger(region.endLine)
      && region.startLine > 0
      && region.endLine >= region.startLine
    );
}

export async function readIssueDataset(filePath: string): Promise<IssueBenchmarkInstance[]> {
  const content = await fs.readFile(path.resolve(filePath), "utf8");
  const instances: IssueBenchmarkInstance[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ContextPackError(`Invalid JSONL at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    if (!isIssueInstance(parsed)) {
      throw new ContextPackError(`Invalid issue instance at line ${index + 1}.`, 2, "INVALID_DATASET");
    }
    instances.push(parsed);
  }
  if (instances.length === 0) throw new ContextPackError("Issue dataset is empty.", 2, "INVALID_DATASET");
  return instances;
}
