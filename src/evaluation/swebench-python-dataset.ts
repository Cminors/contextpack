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

export const SWE_BENCH_LITE_PYTHON = {
  id: "princeton-nlp/SWE-bench_Lite",
  revision: "6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2",
  license: "MIT",
  split: "test",
  file: "data/test-00000-of-00001.parquet",
  parquetSha256: "7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4",
  expectedInstances: 300,
  expectedBalancedInstances: 57,
  balancedPerRepository: 5,
} as const;

export const SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS = {
  "astropy/astropy": 6,
  "django/django": 114,
  "matplotlib/matplotlib": 23,
  "mwaskom/seaborn": 4,
  "pallets/flask": 3,
  "psf/requests": 6,
  "pydata/xarray": 5,
  "pylint-dev/pylint": 6,
  "pytest-dev/pytest": 17,
  "scikit-learn/scikit-learn": 23,
  "sphinx-doc/sphinx": 16,
  "sympy/sympy": 77,
} as const;

export function adaptSweBenchLitePythonRow(
  value: Record<string, unknown>,
): IssueBenchmarkInstance {
  const row = asSweBenchRow(value);
  if (!/^[0-9a-f]{7,40}$/i.test(row.base_commit)) {
    throw new ContextPackError(`Invalid base_commit for ${row.instance_id}.`, 3, "INVALID_DATASET");
  }
  const parsed = parsePatchRegions(row.patch, "python");
  if (parsed.regions.length === 0) {
    throw new ContextPackError(
      `No existing Python gold region for ${row.instance_id}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  return {
    instanceId: row.instance_id,
    sourceDataset: SWE_BENCH_LITE_PYTHON.id,
    sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
    repo: row.repo,
    baseCommit: row.base_commit,
    issueText: row.problem_statement.replace(/\r\n/g, "\n").trim(),
    language: "python",
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

const repositoryCounts = (
  instances: readonly IssueBenchmarkInstance[],
): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const instance of instances) counts.set(instance.repo, (counts.get(instance.repo) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
};

const assertPinnedDistribution = (instances: readonly IssueBenchmarkInstance[]): void => {
  if (instances.length !== SWE_BENCH_LITE_PYTHON.expectedInstances) {
    throw new ContextPackError(
      `Expected ${SWE_BENCH_LITE_PYTHON.expectedInstances} Python instances, found ${instances.length}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  if (JSON.stringify(repositoryCounts(instances))
    !== JSON.stringify(SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS)) {
    throw new ContextPackError(
      "SWE-bench Lite Python repository distribution changed.",
      3,
      "DATASET_DRIFT",
    );
  }
};

export const adaptSweBenchLitePythonRows = (
  rows: Array<Record<string, unknown>>,
): IssueBenchmarkInstance[] => {
  const instances = rows
    .map(adaptSweBenchLitePythonRow)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  const ids = instances.map((instance) => instance.instanceId);
  if (new Set(ids).size !== ids.length) {
    throw new ContextPackError(
      "SWE-bench Lite contains duplicate instance IDs.",
      3,
      "DATASET_DRIFT",
    );
  }
  assertPinnedDistribution(instances);
  return instances;
};

export const selectBalancedPythonInstances = (
  instances: readonly IssueBenchmarkInstance[],
): IssueBenchmarkInstance[] => {
  const byRepository = new Map<string, IssueBenchmarkInstance[]>();
  for (const instance of instances) {
    const group = byRepository.get(instance.repo) ?? [];
    group.push(instance);
    byRepository.set(instance.repo, group);
  }
  return [...byRepository.keys()].sort().flatMap((repo) =>
    [...(byRepository.get(repo) ?? [])]
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
      .slice(0, SWE_BENCH_LITE_PYTHON.balancedPerRepository))
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
};

export interface PythonDatasetManifest {
  version: 1;
  sourceDataset: typeof SWE_BENCH_LITE_PYTHON.id;
  sourceRevision: typeof SWE_BENCH_LITE_PYTHON.revision;
  sourceFile: typeof SWE_BENCH_LITE_PYTHON.file;
  sourceUrl: string;
  license: typeof SWE_BENCH_LITE_PYTHON.license;
  split: typeof SWE_BENCH_LITE_PYTHON.split;
  parquetSha256: string;
  totalRows: number;
  instances: number;
  repositoryCounts: Record<string, number>;
  selection: { kind: "all" } | { kind: "per-repository-cap"; cap: number };
  selectedInstanceIds: string[];
}

const manifestFor = (
  instances: IssueBenchmarkInstance[],
  sourceUrl: string,
  parquetSha256: string,
  selection: PythonDatasetManifest["selection"],
): PythonDatasetManifest => ({
  version: 1,
  sourceDataset: SWE_BENCH_LITE_PYTHON.id,
  sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
  sourceFile: SWE_BENCH_LITE_PYTHON.file,
  sourceUrl,
  license: SWE_BENCH_LITE_PYTHON.license,
  split: SWE_BENCH_LITE_PYTHON.split,
  parquetSha256,
  totalRows: SWE_BENCH_LITE_PYTHON.expectedInstances,
  instances: instances.length,
  repositoryCounts: repositoryCounts(instances),
  selection,
  selectedInstanceIds: instances.map((instance) => instance.instanceId),
});

export interface PythonDatasetArtifacts {
  fullInstances: IssueBenchmarkInstance[];
  balancedInstances: IssueBenchmarkInstance[];
  fullManifest: PythonDatasetManifest;
  balancedManifest: PythonDatasetManifest;
}

export const buildSweBenchLitePythonArtifacts = (
  fullInstances: IssueBenchmarkInstance[],
  sourceUrl: string,
  parquetSha256: string,
): PythonDatasetArtifacts => {
  assertPinnedDistribution(fullInstances);
  const balancedInstances = selectBalancedPythonInstances(fullInstances);
  if (balancedInstances.length !== SWE_BENCH_LITE_PYTHON.expectedBalancedInstances) {
    throw new ContextPackError(
      `Expected ${SWE_BENCH_LITE_PYTHON.expectedBalancedInstances} balanced instances, found ${balancedInstances.length}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  return {
    fullInstances,
    balancedInstances,
    fullManifest: manifestFor(fullInstances, sourceUrl, parquetSha256, { kind: "all" }),
    balancedManifest: manifestFor(balancedInstances, sourceUrl, parquetSha256, {
      kind: "per-repository-cap",
      cap: SWE_BENCH_LITE_PYTHON.balancedPerRepository,
    }),
  };
};

export interface PythonDatasetPreparationResult {
  fullOutputPath: string;
  balancedOutputPath: string;
  fullManifestPath: string;
  balancedManifestPath: string;
  parquetPath: string;
  fullInstanceCount: number;
  balancedInstanceCount: number;
  repositories: number;
  parquetSha256: string;
}

const jsonl = (instances: readonly IssueBenchmarkInstance[]): string =>
  `${instances.map((instance) => JSON.stringify(instance)).join("\n")}\n`;

const manifestJson = (manifest: PythonDatasetManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;

const writeFileAtomically = async (target: string, content: string): Promise<void> => {
  const temporary = `${target}.part`;
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};

const artifactIsCurrent = async (
  outputPath: string,
  manifestPath: string,
  instances: readonly IssueBenchmarkInstance[],
  expectedManifest: PythonDatasetManifest,
): Promise<void> => {
  let output: string;
  let manifest: unknown;
  try {
    output = await fs.readFile(outputPath, "utf8");
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  } catch {
    throw new ContextPackError(
      `Existing Python dataset artifact is incomplete or invalid: ${outputPath}.`,
      3,
      "DATASET_DRIFT",
    );
  }
  const item = manifest as Partial<PythonDatasetManifest> | null;
  if (output !== jsonl(instances)
    || item === null
    || item.sourceRevision !== expectedManifest.sourceRevision
    || item.parquetSha256 !== expectedManifest.parquetSha256
    || JSON.stringify(item.selection) !== JSON.stringify(expectedManifest.selection)
    || JSON.stringify(item.selectedInstanceIds) !== JSON.stringify(expectedManifest.selectedInstanceIds)) {
    throw new ContextPackError(
      `Existing Python dataset artifact does not match the pinned source: ${outputPath}.`,
      3,
      "DATASET_DRIFT",
    );
  }
};

const writeOrVerifyArtifact = async (
  outputPath: string,
  instances: readonly IssueBenchmarkInstance[],
  manifest: PythonDatasetManifest,
  force: boolean,
): Promise<string> => {
  const manifestPath = `${outputPath}.manifest.json`;
  if (!force && await exists(outputPath)) {
    await artifactIsCurrent(outputPath, manifestPath, instances, manifest);
    return manifestPath;
  }
  await writeFileAtomically(outputPath, jsonl(instances));
  await writeFileAtomically(manifestPath, manifestJson(manifest));
  return manifestPath;
};

export async function prepareSweBenchLitePython(
  fullOutputPath: string,
  balancedOutputPath: string,
  options: { force?: boolean; parquetPath?: string } = {},
): Promise<PythonDatasetPreparationResult> {
  const resolvedFullOutput = path.resolve(fullOutputPath);
  const resolvedBalancedOutput = path.resolve(balancedOutputPath);
  await fs.mkdir(path.dirname(resolvedFullOutput), { recursive: true });
  await fs.mkdir(path.dirname(resolvedBalancedOutput), { recursive: true });
  const resolvedParquet = path.resolve(options.parquetPath ?? path.join(
    path.dirname(resolvedFullOutput),
    `${SWE_BENCH_LITE_PYTHON.revision}.parquet`,
  ));
  const endpoint = (process.env.HF_ENDPOINT?.trim() || "https://huggingface.co").replace(/\/$/, "");
  const sourceUrl = `${endpoint}/datasets/${SWE_BENCH_LITE_PYTHON.id}/resolve/${SWE_BENCH_LITE_PYTHON.revision}/${SWE_BENCH_LITE_PYTHON.file}`;
  if (options.force || !(await exists(resolvedParquet))) {
    await fs.mkdir(path.dirname(resolvedParquet), { recursive: true });
    await downloadPinnedFile(sourceUrl, resolvedParquet);
  }

  const parquetBytes = await fs.readFile(resolvedParquet);
  const parquetSha256 = sha256(parquetBytes);
  if (parquetSha256 !== SWE_BENCH_LITE_PYTHON.parquetSha256) {
    throw new ContextPackError(
      `Dataset checksum mismatch: expected ${SWE_BENCH_LITE_PYTHON.parquetSha256}, received ${parquetSha256}.`,
      3,
      "DATASET_INTEGRITY_FAILED",
    );
  }

  const rows = await readSweBenchRows(resolvedParquet);
  const fullInstances = adaptSweBenchLitePythonRows(rows);
  const artifacts = buildSweBenchLitePythonArtifacts(fullInstances, sourceUrl, parquetSha256);
  const force = options.force ?? false;
  const fullManifestPath = await writeOrVerifyArtifact(
    resolvedFullOutput,
    artifacts.fullInstances,
    artifacts.fullManifest,
    force,
  );
  const balancedManifestPath = await writeOrVerifyArtifact(
    resolvedBalancedOutput,
    artifacts.balancedInstances,
    artifacts.balancedManifest,
    force,
  );

  return {
    fullOutputPath: resolvedFullOutput,
    balancedOutputPath: resolvedBalancedOutput,
    fullManifestPath,
    balancedManifestPath,
    parquetPath: resolvedParquet,
    fullInstanceCount: artifacts.fullInstances.length,
    balancedInstanceCount: artifacts.balancedInstances.length,
    repositories: Object.keys(artifacts.fullManifest.repositoryCounts).length,
    parquetSha256,
  };
}
