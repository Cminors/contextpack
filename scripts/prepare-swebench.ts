import path from "node:path";
import { prepareSweBenchMultilingual } from "../src/evaluation/swebench-dataset.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const output = path.resolve(option("--output") ?? path.join(
    ".benchmarks",
    "datasets",
    "swe-bench-multilingual-js-ts.jsonl",
  ));
  const parquetPath = option("--parquet");
  const result = await prepareSweBenchMultilingual(output, {
    force: process.argv.includes("--force"),
    ...(parquetPath ? { parquetPath } : {}),
  });

  process.stdout.write(
    `Prepared ${result.instances} JS/TS issue instances at ${result.outputPath}\n`
    + `Pinned parquet SHA-256: ${result.parquetSha256}\n`,
  );
} catch (error) {
  process.stderr.write(`contextpack: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
