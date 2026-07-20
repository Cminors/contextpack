import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { IssueBenchmarkInstance } from "../src/evaluation/issue-types.js";
import {
  adaptSweBenchLitePythonRow,
  adaptSweBenchLitePythonRows,
  buildSweBenchLitePythonArtifacts,
  prepareSweBenchLitePython,
  selectBalancedPythonInstances,
  SWE_BENCH_LITE_PYTHON,
  SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS,
} from "../src/evaluation/swebench-python-dataset.js";

const pythonPatch = `diff --git a/requests/api.py b/requests/api.py
--- a/requests/api.py
+++ b/requests/api.py
@@ -10,2 +10,2 @@
-old
+new
 context
`;

const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  instance_id: "psf__requests-1",
  repo: "psf/requests",
  base_commit: "1234567890abcdef",
  problem_statement: "Fix timeout propagation.\r\n",
  issue_url: "https://github.com/psf/requests/issues/1",
  pr_url: "https://github.com/psf/requests/pull/2",
  created_at: "2024-01-01",
  patch: pythonPatch,
  ...overrides,
});

const instance = (repo: string, index: number): IssueBenchmarkInstance => ({
  instanceId: `${repo.replace("/", "__")}-${index.toString().padStart(3, "0")}`,
  sourceDataset: SWE_BENCH_LITE_PYTHON.id,
  sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
  repo,
  baseCommit: "1234567890abcdef",
  issueText: "Fix a Python issue.",
  language: "python",
  goldRegions: [{ path: "module.py", startLine: 1, endLine: 1, kind: "patch-hunk" }],
  metadata: {
    issueUrl: null,
    prUrl: null,
    createdAt: null,
    patchSha256: "0".repeat(64),
    excludedPatchFiles: 0,
  },
});

const pinnedInstances = (): IssueBenchmarkInstance[] => Object.entries(
  SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS,
).flatMap(([repo, count]) => Array.from({ length: count }, (_, index) => instance(repo, index + 1)));

describe("SWE-bench Lite Python adapter", () => {
  it("normalizes a Python issue without retaining the gold patch", () => {
    const adapted = adaptSweBenchLitePythonRow(row());

    expect(adapted).toMatchObject({
      instanceId: "psf__requests-1",
      sourceDataset: "princeton-nlp/SWE-bench_Lite",
      language: "python",
      goldRegions: [{ path: "requests/api.py", startLine: 10, endLine: 11 }],
      metadata: { excludedPatchFiles: 0 },
    });
    expect(adapted).not.toHaveProperty("patch");
    expect(adapted.issueText).toBe("Fix timeout propagation.");
    expect(adapted.metadata.patchSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when a row has no existing Python hunk", () => {
    expect(() => adaptSweBenchLitePythonRow(row({
      patch: `diff --git a/docs/usage.md b/docs/usage.md
--- a/docs/usage.md
+++ b/docs/usage.md
@@ -1 +1 @@
-old
+new`,
    }))).toThrowError(/No existing Python gold region/);
  });

  it("requires the exact pinned repository distribution", () => {
    const rows = pinnedInstances().map((item) => row({
      instance_id: item.instanceId,
      repo: item.repo,
    }));

    const full = adaptSweBenchLitePythonRows(rows);

    expect(full).toHaveLength(300);
    expect(new Set(full.map((item) => item.repo)).size).toBe(12);
    expect(() => adaptSweBenchLitePythonRows(rows.slice(1))).toThrowError(/Expected 300 Python instances/);
  });

  it("rejects duplicate instance IDs before accepting pinned data", () => {
    const rows = pinnedInstances().map((item) => row({
      instance_id: item.instanceId,
      repo: item.repo,
    }));
    rows[1] = { ...rows[1], instance_id: rows[0]?.instance_id };

    expect(() => adaptSweBenchLitePythonRows(rows)).toThrowError(/duplicate instance IDs/);
  });
});

describe("SWE-bench Lite Python balanced selection", () => {
  it("deterministically selects the first five IDs per repository", () => {
    const full = pinnedInstances();
    const selected = selectBalancedPythonInstances(full);

    expect(selected).toHaveLength(57);
    expect(selectBalancedPythonInstances([...full].reverse())).toEqual(selected);
    expect(selected).toEqual([...selected].sort((left, right) => left.instanceId.localeCompare(right.instanceId)));
  });

  it("builds full and balanced manifests with exact selected IDs", () => {
    const full = pinnedInstances();
    const artifacts = buildSweBenchLitePythonArtifacts(full, "https://example.test/data.parquet", "a".repeat(64));

    expect(artifacts.fullInstances).toEqual(full);
    expect(artifacts.balancedInstances).toHaveLength(57);
    expect(artifacts.fullManifest).toMatchObject({
      totalRows: 300,
      instances: 300,
      repositoryCounts: SWE_BENCH_LITE_PYTHON_REPOSITORY_COUNTS,
      selection: { kind: "all" },
    });
    expect(artifacts.balancedManifest).toMatchObject({
      instances: 57,
      selection: { kind: "per-repository-cap", cap: 5 },
    });
    expect(artifacts.balancedManifest.selectedInstanceIds).toEqual(
      selectBalancedPythonInstances(full).map((item) => item.instanceId),
    );
  });

  it("rejects distribution drift before building artifacts", () => {
    expect(() => buildSweBenchLitePythonArtifacts(
      pinnedInstances().slice(1),
      "https://example.test/data.parquet",
      "a".repeat(64),
    )).toThrowError(/distribution|Expected 300 Python instances/i);
  });
});

describe("SWE-bench Lite Python preparation", () => {
  it("verifies the pinned checksum before decoding Parquet", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-dataset-"));
    const parquetPath = path.join(directory, "dataset.parquet");
    await fs.writeFile(parquetPath, "not parquet", "utf8");

    try {
      await expect(prepareSweBenchLitePython(
        path.join(directory, "full.jsonl"),
        path.join(directory, "balanced.jsonl"),
        { parquetPath },
      )).rejects.toMatchObject({ code: "DATASET_INTEGRITY_FAILED" });
      await expect(fs.access(path.join(directory, "full.jsonl"))).rejects.toThrow();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("atomically writes pinned artifacts and rejects a stale manifest", async () => {
    const rows = pinnedInstances().map((item) => row({
      instance_id: item.instanceId,
      repo: item.repo,
    }));
    vi.resetModules();
    vi.doMock("../src/evaluation/swebench-source.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/evaluation/swebench-source.js")>();
      return {
        ...actual,
        readSweBenchRows: async () => rows,
        sha256: () => SWE_BENCH_LITE_PYTHON.parquetSha256,
      };
    });
    const { prepareSweBenchLitePython: prepare } = await import(
      "../src/evaluation/swebench-python-dataset.js"
    );
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-python-prepare-"));
    const parquetPath = path.join(directory, "dataset.parquet");
    const fullOutput = path.join(directory, "full.jsonl");
    const balancedOutput = path.join(directory, "balanced.jsonl");
    await fs.writeFile(parquetPath, "pinned parquet fixture", "utf8");
    const rename = vi.spyOn(fs, "rename");

    try {
      const result = await prepare(fullOutput, balancedOutput, { parquetPath });
      expect(result).toMatchObject({
        fullInstanceCount: 300,
        balancedInstanceCount: 57,
        repositories: 12,
        parquetSha256: SWE_BENCH_LITE_PYTHON.parquetSha256,
      });
      expect(rename).toHaveBeenCalledTimes(4);
      await expect(fs.access(`${fullOutput}.part`)).rejects.toThrow();
      await expect(fs.access(`${fullOutput}.manifest.json.part`)).rejects.toThrow();

      const balancedManifestPath = `${balancedOutput}.manifest.json`;
      const balancedManifest = JSON.parse(await fs.readFile(balancedManifestPath, "utf8")) as {
        selectedInstanceIds: string[];
        selection: unknown;
      };
      expect(balancedManifest.selection).toEqual({ kind: "per-repository-cap", cap: 5 });
      expect(balancedManifest.selectedInstanceIds).toEqual(
        selectBalancedPythonInstances(pinnedInstances()).map((item) => item.instanceId),
      );

      await fs.writeFile(balancedManifestPath, JSON.stringify({
        ...balancedManifest,
        selectedInstanceIds: balancedManifest.selectedInstanceIds.slice(1),
      }), "utf8");
      await expect(prepare(fullOutput, balancedOutput, { parquetPath }))
        .rejects.toMatchObject({ code: "DATASET_DRIFT" });
    } finally {
      rename.mockRestore();
      vi.doUnmock("../src/evaluation/swebench-source.js");
      vi.resetModules();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
