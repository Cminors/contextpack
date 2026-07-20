import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type {
  IssueBenchmarkReport,
  IssueEvaluationResult,
} from "../src/evaluation/issue-types.js";
import {
  evaluatePythonBenchmarkGates,
  PYTHON_SUPPORT_FLOORS,
} from "../src/evaluation/python-benchmark-gates.js";
import { SWE_BENCH_LITE_PYTHON } from "../src/evaluation/swebench-python-dataset.js";

const result = (index: number): IssueEvaluationResult => ({
  instanceId: `fixture-${index}`,
  repo: "fixture/repo",
  baseCommit: "a".repeat(40),
  goldRegions: [{ path: "module.py", startLine: 1, endLine: 1, kind: "patch-hunk" }],
  predictedRegions: [{ path: "module.py", startLine: 1, endLine: 1 }],
  goldFiles: ["module.py"],
  predictions: ["module.py"],
  recallAt5: 1,
  recallAt10: 1,
  reciprocalRank: 1,
  regionMetrics: {},
  estimatedTokens: 100,
  durationMs: 10,
});

const report = (overrides: Partial<IssueBenchmarkReport> = {}): IssueBenchmarkReport => ({
  version: 1,
  generatedAt: "2026-07-20T00:00:00.000Z",
  sourceDataset: SWE_BENCH_LITE_PYTHON.id,
  sourceRevision: SWE_BENCH_LITE_PYTHON.revision,
  requestedInstances: 300,
  validInstances: 300,
  tokenBudget: 12_000,
  lineBudgets: [100, 250, 500],
  results: Array.from({ length: 300 }, (_, index) => result(index)),
  skipped: [],
  aggregate: {
    recallAt5: 0.3,
    recallAt10: PYTHON_SUPPORT_FLOORS.recallAt10,
    mrr: PYTHON_SUPPORT_FLOORS.mrr,
    medianTokens: 100,
    medianDurationMs: 10,
    regionMetrics: {
      "500": {
        budgetLines: 500,
        medianEmittedLines: 100,
        linePrecision: 0.1,
        lineRecall: PYTHON_SUPPORT_FLOORS.lineRecallAt500,
        lineF1: 0.1,
        hitRegionRate: 0.1,
        noiseRegionRate: 0.1,
        contextEfficiency: 0.1,
        ndcg: 0.1,
        usefulHitRate: PYTHON_SUPPORT_FLOORS.usefulHitAt500,
        medianFirstUsefulHit: 10,
      },
    },
  },
  limitations: [],
  ...overrides,
});

const runCli = (contents: string) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "contextpack-python-gates-"));
  const reportPath = path.join(directory, "results.json");
  fs.writeFileSync(reportPath, contents);
  const outcome = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("scripts/validate-python-benchmark.ts"),
      reportPath,
    ],
    { encoding: "utf8" },
  );
  fs.rmSync(directory, { recursive: true, force: true });
  return outcome;
};

describe("Python benchmark support gates", () => {
  it("validates a complete run at every declared floor", () => {
    expect(evaluatePythonBenchmarkGates(report())).toEqual({
      verdict: "validated",
      failures: [],
      metrics: {
        recallAt10: 0.25,
        mrr: 0.1,
        lineRecallAt500: 0.05,
        usefulHitAt500: 0.1,
      },
    });
  });

  it("reports file-only when a region floor fails", () => {
    const base = report();
    const outcome = evaluatePythonBenchmarkGates(report({
      aggregate: {
        ...base.aggregate,
        regionMetrics: {
          "500": {
            ...base.aggregate.regionMetrics["500"]!,
            lineRecall: 0.049,
            usefulHitRate: 0.099,
          },
        },
      },
    }));

    expect(outcome).toMatchObject({
      verdict: "file-only",
      failures: ["line@500 below 0.050", "useful-hit@500 below 0.100"],
    });
  });

  it("reports not-validated and only file failures when file and region floors fail", () => {
    const base = report();
    const outcome = evaluatePythonBenchmarkGates(report({
      aggregate: {
        ...base.aggregate,
        recallAt10: 0.249,
        mrr: 0.099,
        regionMetrics: {
          "500": {
            ...base.aggregate.regionMetrics["500"]!,
            lineRecall: 0,
            usefulHitRate: 0,
          },
        },
      },
    }));

    expect(outcome).toMatchObject({
      verdict: "not-validated",
      failures: ["Recall@10 below 0.250", "MRR below 0.100"],
    });
  });

  it("reports invalid-run before evaluating metrics", () => {
    const outcome = evaluatePythonBenchmarkGates(report({
      skipped: [{ instanceId: "fixture-1", reason: "timeout" }],
    }));

    expect(outcome).toMatchObject({
      verdict: "invalid-run",
      failures: ["skipped instances must be empty"],
    });
  });

  it.each([
    ["source dataset", { sourceDataset: "other/dataset" }, "source dataset mismatch"],
    ["source revision", { sourceRevision: "other-revision" }, "source revision mismatch"],
    ["requested count", { requestedInstances: 299 }, "requested instance count must be 300"],
    ["valid count", { validInstances: 299 }, "valid instance count must be 300"],
    ["result count", { results: [] }, "result count must be 300"],
    ["skipped instances", { skipped: [{ instanceId: "fixture-1", reason: "timeout" }] }, "skipped instances must be empty"],
  ] satisfies Array<[string, Partial<IssueBenchmarkReport>, string]>) (
    "rejects an invalid %s",
    (_label, overrides, failure) => {
      expect(evaluatePythonBenchmarkGates(report(overrides))).toMatchObject({
        verdict: "invalid-run",
        failures: [failure],
      });
    },
  );

  it("rejects a report without the 500-line aggregate", () => {
    const base = report();

    expect(evaluatePythonBenchmarkGates(report({
      aggregate: { ...base.aggregate, regionMetrics: {} },
    }))).toMatchObject({
      verdict: "invalid-run",
      failures: ["500-line aggregate is missing"],
      metrics: {
        lineRecallAt500: Number.NaN,
        usefulHitAt500: Number.NaN,
      },
    });
  });

  it.each([
    ["version", { version: 2 }, "report version must be 1"],
    ["token budget", { tokenBudget: 11_999 }, "token budget must be 12000"],
    ["line budgets", { lineBudgets: [100, 500, 250] }, "line budgets must be exactly 100,250,500"],
  ] satisfies Array<[string, Record<string, unknown>, string]>) (
    "rejects a report with an invalid %s",
    (_label, overrides, failure) => {
      expect(evaluatePythonBenchmarkGates(report(
        overrides as unknown as Partial<IssueBenchmarkReport>,
      ))).toMatchObject({
        verdict: "invalid-run",
        failures: [failure],
      });
    },
  );

  it("rejects duplicate result instance IDs", () => {
    const base = report();
    const results = [...base.results];
    results[1] = { ...results[1]!, instanceId: results[0]!.instanceId };

    expect(evaluatePythonBenchmarkGates(report({ results }))).toMatchObject({
      verdict: "invalid-run",
      failures: ["result instance IDs must be unique"],
    });
  });

  const missing = Symbol("missing");
  const withMetric = (
    metric: "recallAt10" | "mrr" | "lineRecall" | "usefulHitAt500",
    value: unknown,
  ): IssueBenchmarkReport => {
    const base = report();
    const aggregate = { ...base.aggregate } as Record<string, unknown>;
    if (metric === "recallAt10" || metric === "mrr") {
      if (value === missing) delete aggregate[metric];
      else aggregate[metric] = value;
    } else {
      const at500 = { ...base.aggregate.regionMetrics["500"] } as Record<string, unknown>;
      const key = metric === "lineRecall" ? "lineRecall" : "usefulHitRate";
      if (value === missing) delete at500[key];
      else at500[key] = value;
      aggregate.regionMetrics = { "500": at500 };
    }
    return report({ aggregate: aggregate as IssueBenchmarkReport["aggregate"] });
  };

  it.each([
    ["Recall@10", "recallAt10"],
    ["MRR", "mrr"],
    ["line recall @500", "lineRecall"],
    ["useful hit @500", "usefulHitAt500"],
  ] satisfies Array<[string, "recallAt10" | "mrr" | "lineRecall" | "usefulHitAt500"]>) (
    "rejects a null %s metric",
    (_label, metric) => {
      expect(evaluatePythonBenchmarkGates(withMetric(metric, null))).toMatchObject({
        verdict: "invalid-run",
      });
    },
  );

  it.each([
    ["Recall@10", "recallAt10"],
    ["MRR", "mrr"],
    ["line recall @500", "lineRecall"],
    ["useful hit @500", "usefulHitAt500"],
  ] satisfies Array<[string, "recallAt10" | "mrr" | "lineRecall" | "usefulHitAt500"]>) (
    "rejects a missing %s metric",
    (_label, metric) => {
      expect(evaluatePythonBenchmarkGates(withMetric(metric, missing))).toMatchObject({
        verdict: "invalid-run",
      });
    },
  );

  it.each([
    ["Recall@10", "recallAt10"],
    ["MRR", "mrr"],
    ["line recall @500", "lineRecall"],
    ["useful hit @500", "usefulHitAt500"],
  ] satisfies Array<[string, "recallAt10" | "mrr" | "lineRecall" | "usefulHitAt500"]>) (
    "rejects a non-number %s metric",
    (_label, metric) => {
      expect(evaluatePythonBenchmarkGates(withMetric(metric, "0.25"))).toMatchObject({
        verdict: "invalid-run",
      });
    },
  );

  it.each([
    ["Recall@10", "recallAt10"],
    ["MRR", "mrr"],
    ["line recall @500", "lineRecall"],
    ["useful hit @500", "usefulHitAt500"],
  ] satisfies Array<[string, "recallAt10" | "mrr" | "lineRecall" | "usefulHitAt500"]>) (
    "rejects a non-finite %s metric",
    (_label, metric) => {
      expect(evaluatePythonBenchmarkGates(withMetric(metric, Number.POSITIVE_INFINITY))).toMatchObject({
        verdict: "invalid-run",
      });
    },
  );

  it("rejects a null 500 aggregate", () => {
    const base = report();
    const aggregate = {
      ...base.aggregate,
      regionMetrics: { "500": null },
    } as unknown as IssueBenchmarkReport["aggregate"];

    expect(evaluatePythonBenchmarkGates(report({ aggregate }))).toMatchObject({
      verdict: "invalid-run",
      failures: ["500-line aggregate is missing"],
    });
  });

  it("reports a missing metric as an invalid run", () => {
    const base = report();
    const aggregate = { ...base.aggregate } as unknown as {
      recallAt10?: number;
      mrr: number;
      medianTokens: number;
      medianDurationMs: number;
      recallAt5: number;
      regionMetrics: typeof base.aggregate.regionMetrics;
    };
    delete aggregate.recallAt10;

    expect(evaluatePythonBenchmarkGates(report({
      aggregate: aggregate as unknown as IssueBenchmarkReport["aggregate"],
    }))).toMatchObject({
      verdict: "invalid-run",
    });
  });

});

describe("Python benchmark gate CLI", () => {
  it("prints validated metrics to six decimals and exits zero", () => {
    const outcome = runCli(JSON.stringify(report()));

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toBe(
      "Recall@10: 0.250000\n"
      + "MRR: 0.100000\n"
      + "Line recall @500: 0.050000\n"
      + "Useful hit @500: 0.100000\n"
      + "Verdict: validated\n",
    );
    expect(outcome.stderr).toBe("");
  }, 20_000);

  it("prints every measurement failure and exits one", () => {
    const base = report();
    const outcome = runCli(JSON.stringify(report({
      aggregate: {
        ...base.aggregate,
        recallAt10: 0.2,
        mrr: 0.09,
      },
    })));

    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain("Verdict: not-validated\n");
    expect(outcome.stdout).toContain("Failure: Recall@10 below 0.250\n");
    expect(outcome.stdout).toContain("Failure: MRR below 0.100\n");
    expect(outcome.stderr).toBe("");
  }, 20_000);

  it("prints invalid-run failures and exits two", () => {
    const outcome = runCli(JSON.stringify(report({
      requestedInstances: 299,
      validInstances: 299,
    })));

    expect(outcome.status).toBe(2);
    expect(outcome.stdout).toContain("Verdict: invalid-run\n");
    expect(outcome.stdout).toContain("Failure: requested instance count must be 300\n");
    expect(outcome.stdout).toContain("Failure: valid instance count must be 300\n");
    expect(outcome.stderr).toBe("");
  }, 20_000);

  it("rejects malformed JSON with exit two", () => {
    const outcome = runCli("{");

    expect(outcome.status).toBe(2);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toMatch(/^Invalid JSON or unreadable input:/);
  }, 20_000);

  it("rejects a structurally invalid metric with exit two", () => {
    const invalid = report() as unknown as { aggregate: { recallAt10: null } };
    invalid.aggregate.recallAt10 = null;
    const outcome = runCli(JSON.stringify(invalid));

    expect(outcome.status).toBe(2);
    expect(outcome.stdout).toContain("Verdict: invalid-run\n");
    expect(outcome.stdout).toContain("Failure: Recall@10 must be a finite number\n");
    expect(outcome.stderr).toBe("");
  }, 20_000);

  it("rejects JSON numeric overflow with exit two", () => {
    const contents = JSON.stringify(report()).replace(
      '"recallAt10":0.25',
      '"recallAt10":1e999',
    );
    const outcome = runCli(contents);

    expect(outcome.status).toBe(2);
    expect(outcome.stdout).toContain("Verdict: invalid-run\n");
    expect(outcome.stdout).toContain("Failure: Recall@10 must be a finite number\n");
    expect(outcome.stderr).toBe("");
  }, 20_000);

  it("rejects a structurally malformed report without an uncaught error", () => {
    const outcome = runCli(JSON.stringify({ ...report(), aggregate: null }));

    expect(outcome.status).toBe(2);
    expect(outcome.stdout).toContain("Verdict: invalid-run\n");
    expect(outcome.stdout).toContain("Failure: 500-line aggregate is missing\n");
    expect(outcome.stderr).toBe("");
  }, 20_000);
});
