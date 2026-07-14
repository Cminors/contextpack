import fs from "node:fs/promises";
import path from "node:path";
import type { IssueFailureAudit } from "../src/evaluation/issue-audit.js";
import { readIssueDataset } from "../src/evaluation/swebench-dataset.js";

const root = process.cwd();
const auditPath = path.resolve(
  process.argv[2] ?? path.join(root, "benchmarks", "results", "swebench-multilingual-full-p05", "audit.json"),
);
const outputPath = path.resolve(
  process.argv[3] ?? path.join(root, ".benchmarks", "datasets", "swe-bench-multilingual-p06-ranking-misses.jsonl"),
);
const datasetPath = path.resolve(
  process.argv[4] ?? path.join(root, ".benchmarks", "datasets", "swe-bench-multilingual-js-ts.jsonl"),
);

const audit = JSON.parse(await fs.readFile(auditPath, "utf8")) as IssueFailureAudit;
if (!Array.isArray(audit.entries)) throw new Error(`Invalid issue audit: ${auditPath}`);
const instanceIds = new Set(
  audit.entries
    .filter((entry) => entry.category === "file-miss-outside-top-20")
    .map((entry) => entry.instanceId),
);
const instances = (await readIssueDataset(datasetPath)).filter((instance) => instanceIds.has(instance.instanceId));
if (instances.length !== instanceIds.size) {
  const found = new Set(instances.map((instance) => instance.instanceId));
  const missing = [...instanceIds].filter((instanceId) => !found.has(instanceId));
  throw new Error(`Diagnostic instances missing from dataset: ${missing.join(", ")}`);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${instances.map((instance) => JSON.stringify(instance)).join("\n")}\n`);
process.stdout.write(`Diagnostic subset: ${outputPath}\nInstances: ${instances.length}\n`);
