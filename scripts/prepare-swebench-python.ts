import path from "node:path";
import { prepareSweBenchLitePython } from "../src/evaluation/swebench-python-dataset.js";

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

try {
  const fullOutput = path.resolve(option("--full-output") ?? path.join(
    ".benchmarks",
    "datasets",
    "swe-bench-lite-python-full-300.jsonl",
  ));
  const balancedOutput = path.resolve(option("--balanced-output") ?? path.join(
    ".benchmarks",
    "datasets",
    "swe-bench-lite-python-balanced-57.jsonl",
  ));
  const parquetPath = option("--parquet");
  const result = await prepareSweBenchLitePython(fullOutput, balancedOutput, {
    force: process.argv.includes("--force"),
    ...(parquetPath ? { parquetPath } : {}),
  });

  process.stdout.write(
    `Prepared ${result.fullInstanceCount} full and ${result.balancedInstanceCount} balanced Python issue instances\n`
    + `Full dataset: ${result.fullOutputPath}\n`
    + `Balanced dataset: ${result.balancedOutputPath}\n`
    + `Pinned parquet SHA-256: ${result.parquetSha256}\n`,
  );
} catch (error) {
  process.stderr.write(`contextpack: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
