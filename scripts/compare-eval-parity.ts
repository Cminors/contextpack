import { readFile } from "node:fs/promises";
import type { IssueBenchmarkReport } from "../src/evaluation/issue-types.js";
import { compareIssueParity } from "../src/evaluation/parity.js";

const usage = "Usage: compare-eval-parity <baseline-results.json> <current-results.json>";

const main = async (): Promise<void> => {
  const paths = process.argv.slice(2);
  if (paths.length !== 2) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  let baseline: IssueBenchmarkReport;
  let current: IssueBenchmarkReport;
  try {
    const [baselineText, currentText] = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    baseline = JSON.parse(baselineText) as IssueBenchmarkReport;
    current = JSON.parse(currentText) as IssueBenchmarkReport;
  } catch (error) {
    console.error(`Invalid JSON or unreadable input: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  let mismatches: string[];
  try {
    mismatches = compareIssueParity(baseline, current);
  } catch (error) {
    console.error(`Invalid issue evaluation report: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }
  if (mismatches.length === 0) {
    console.log("Parity: equal");
    return;
  }

  console.log("Parity: different");
  for (const mismatch of mismatches) {
    console.log(`Mismatch: ${mismatch}`);
  }
  process.exitCode = 1;
};

await main();
