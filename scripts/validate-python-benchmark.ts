import { readFile } from "node:fs/promises";
import {
  evaluatePythonBenchmarkGates,
  type PythonBenchmarkGateResult,
} from "../src/evaluation/python-benchmark-gates.js";
import type { IssueBenchmarkReport } from "../src/evaluation/issue-types.js";

const usage = "Usage: validate-python-benchmark <results.json>";

const printResult = (result: PythonBenchmarkGateResult): void => {
  process.stdout.write(
    `Recall@10: ${result.metrics.recallAt10.toFixed(6)}\n`
    + `MRR: ${result.metrics.mrr.toFixed(6)}\n`
    + `Line recall @500: ${result.metrics.lineRecallAt500.toFixed(6)}\n`
    + `Useful hit @500: ${result.metrics.usefulHitAt500.toFixed(6)}\n`
    + `Verdict: ${result.verdict}\n`
    + result.failures.map((failure) => `Failure: ${failure}\n`).join(""),
  );
};

const main = async (): Promise<void> => {
  const paths = process.argv.slice(2);
  if (paths.length !== 1) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }

  let report: IssueBenchmarkReport;
  try {
    report = JSON.parse(await readFile(paths[0]!, "utf8")) as IssueBenchmarkReport;
  } catch (error) {
    process.stderr.write(
      `Invalid JSON or unreadable input: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return;
  }

  let result: PythonBenchmarkGateResult;
  try {
    result = evaluatePythonBenchmarkGates(report);
  } catch (error) {
    process.stderr.write(
      `Invalid Python benchmark report: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return;
  }

  try {
    printResult(result);
  } catch (error) {
    process.stderr.write(
      `Invalid Python benchmark report: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return;
  }
  process.exitCode = result.verdict === "validated"
    ? 0
    : result.verdict === "invalid-run"
      ? 2
      : 1;
};

await main();
