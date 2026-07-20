import fs from "node:fs/promises";
import path from "node:path";
import { ContextPackError } from "../errors.js";
import type { IssueBenchmarkInstance } from "./issue-types.js";
import { parsePatchRegions } from "./patch-regions.js";
import {
  asSweBenchRow,
  downloadPinnedFile,
  exists,
  readSweBenchRows,
  sha256,
} from "./swebench-source.js";

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

export { readIssueDataset } from "./issue-dataset.js";

export interface DatasetPreparationResult {
  outputPath: string;
  manifestPath: string;
  parquetPath: string;
  instances: number;
  excludedInstances: number;
  parquetSha256: string;
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
  if (options.force || !(await exists(parquetPath))) await downloadPinnedFile(url, parquetPath);

  const parquetBytes = await fs.readFile(parquetPath);
  const parquetSha256 = sha256(parquetBytes);
  if (parquetSha256 !== SWE_BENCH_MULTILINGUAL.parquetSha256) {
    throw new ContextPackError(
      `Dataset checksum mismatch: expected ${SWE_BENCH_MULTILINGUAL.parquetSha256}, received ${parquetSha256}.`,
      3,
      "DATASET_INTEGRITY_FAILED",
    );
  }
  const rows = await readSweBenchRows(parquetPath);
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
