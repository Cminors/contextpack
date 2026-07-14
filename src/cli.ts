import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { analyzeTask } from "./analysis/analyze.js";
import { auditIssueFailures } from "./evaluation/issue-audit.js";
import { runReplay } from "./evaluation/replay.js";
import { runIssueBenchmark } from "./evaluation/issues.js";
import { renderContext, renderEvaluation, renderIssueAudit, renderIssueEvaluation } from "./output/markdown.js";
import { writeArtifacts } from "./output/write.js";
import { toContextPackError } from "./errors.js";
import type { EvaluationQueryMode } from "./types.js";

const program = new Command();

function integer(value: string): number {
  const result = Number.parseInt(value, 10);
  if (!Number.isInteger(result) || result < 1) throw new InvalidArgumentError("must be a positive integer");
  return result;
}

function budget(value: string): number {
  const result = integer(value);
  if (result < 4000 || result > 32000) throw new InvalidArgumentError("must be between 4000 and 32000");
  return result;
}

function evaluationQueryMode(value: string): EvaluationQueryMode {
  if (value === "title" || value === "keyword-ablated") return value;
  throw new InvalidArgumentError("must be title or keyword-ablated");
}

function lineBudgets(value: string): number[] {
  const values = [...new Set(value.split(",").map((item) => integer(item.trim())))].sort((a, b) => a - b);
  if (values.length === 0 || values.some((item) => item > 10_000)) {
    throw new InvalidArgumentError("must be comma-separated line counts between 1 and 10000");
  }
  return values;
}

function seconds(value: string): number {
  const result = integer(value);
  if (result > 86_400) throw new InvalidArgumentError("must be between 1 and 86400 seconds");
  return result;
}

function slug(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "task";
}

program.name("contextpack").description("Build small, explainable context packs for JS/TS coding tasks.").version("0.1.0");

program.command("task")
  .argument("<description>", "feature task description")
  .option("--budget <tokens>", "context budget", budget, 12000)
  .option("--output <directory>", "output directory")
  .option("--format <format>", "markdown, json, or both", "both")
  .option("--history <count>", "Git commits to inspect", integer, 500)
  .action(async (description: string, options: { budget: number; output?: string; format: string; history: number }) => {
    if (!["markdown", "json", "both"].includes(options.format)) throw new InvalidArgumentError("format must be markdown, json, or both");
    const manifest = await analyzeTask({ root: process.cwd(), task: description, budget: options.budget, historyCount: options.history });
    const markdown = renderContext(manifest);
    const output = path.resolve(options.output ?? path.join(manifest.repository.root, ".contextpack", "tasks", slug(description)));
    const files: Record<string, string> = {};
    if (options.format !== "json") files["context.md"] = markdown;
    if (options.format !== "markdown") files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeArtifacts(output, files);
    process.stdout.write(`Context pack: ${output}\nSelected ${manifest.selected.length} snippets; estimated ${manifest.budget.estimatedTokens}/${manifest.budget.requestedTokens} tokens.\n`);
  });

program.command("explain")
  .argument("<path-or-symbol>")
  .requiredOption("--task <description>")
  .option("--history <count>", "Git commits to inspect", integer, 500)
  .action(async (query: string, options: { task: string; history: number }) => {
    const manifest = await analyzeTask({ root: process.cwd(), task: options.task, budget: 12000, historyCount: options.history });
    const normalized = query.toLowerCase();
    const matches = manifest.candidates.filter((item) => item.path.toLowerCase().includes(normalized) || item.symbol?.name.toLowerCase().includes(normalized)).slice(0, 10);
    if (matches.length === 0) throw new InvalidArgumentError(`no candidate matched: ${query}`);
    process.stdout.write(`${JSON.stringify(matches, null, 2)}\n`);
  });

program.command("eval")
  .option("--commits <count>", "valid commits to replay", integer, 20)
  .option("--budget <tokens>", "context budget", budget, 12000)
  .option("--query-mode <mode>", "title or keyword-ablated", evaluationQueryMode, "title")
  .option("--output <directory>", "output directory")
  .action(async (options: { commits: number; budget: number; queryMode: EvaluationQueryMode; output?: string }) => {
    const report = await runReplay(process.cwd(), options.commits, options.budget, options.queryMode);
    const defaultName = options.queryMode === "title" ? "latest" : options.queryMode;
    const output = path.resolve(options.output ?? path.join(report.repository.root, ".contextpack", "evals", defaultName));
    await writeArtifacts(output, { "report.md": renderEvaluation(report), "results.json": `${JSON.stringify(report, null, 2)}\n` });
    process.stdout.write(`Evaluation (${report.queryMode}): ${output}\nRecall@10 ${report.aggregate.recallAt10.toFixed(3)}; MRR ${report.aggregate.mrr.toFixed(3)}.\n`);
  });

program.command("eval-issues")
  .description("Evaluate retrieval on normalized real issue/patch instances")
  .option("--dataset <path>", "normalized issue JSONL dataset")
  .option("--cache <directory>", "bare Git repository cache")
  .option("--budget <tokens>", "context token budget", budget, 12000)
  .option("--line-budgets <lines>", "comma-separated emitted-line budgets", lineBudgets, [100, 250, 500])
  .option("--history <count>", "Git commits to fetch and inspect", integer, 100)
  .option("--limit <count>", "maximum instances", integer)
  .option("--instance <id>", "one exact instance id")
  .option("--repo <owner/name>", "one exact repository")
  .option("--output <directory>", "output directory")
  .option("--checkpoint <path>", "checkpoint file (defaults inside output directory)")
  .option("--instance-timeout <seconds>", "maximum analysis time per instance", seconds, 600)
  .option("--git-timeout <seconds>", "maximum time for each repository fetch", seconds, 300)
  .option("--resume", "continue completed instances from a matching checkpoint")
  .option("--retry-skipped", "with --resume, retry instances recorded as skipped")
  .action(async (options: {
    dataset?: string;
    cache?: string;
    budget: number;
    lineBudgets: number[];
    history: number;
    limit?: number;
    instance?: string;
    repo?: string;
    output?: string;
    checkpoint?: string;
    instanceTimeout: number;
    gitTimeout: number;
    resume?: boolean;
    retrySkipped?: boolean;
  }) => {
    const root = process.cwd();
    const output = path.resolve(options.output ?? path.join(root, ".contextpack", "evals", "swe-bench-multilingual-js-ts"));
    const checkpoint = path.resolve(options.checkpoint ?? path.join(output, "checkpoint.json"));
    const report = await runIssueBenchmark({
      datasetPath: path.resolve(options.dataset ?? path.join(root, ".benchmarks", "datasets", "swe-bench-multilingual-js-ts.jsonl")),
      cacheDirectory: path.resolve(options.cache ?? path.join(root, ".benchmarks", "repositories")),
      tokenBudget: options.budget,
      lineBudgets: options.lineBudgets,
      historyCount: options.history,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.instance ? { instanceId: options.instance } : {}),
      ...(options.repo ? { repo: options.repo } : {}),
      instanceTimeoutMs: options.instanceTimeout * 1000,
      gitTimeoutMs: options.gitTimeout * 1000,
      checkpointPath: checkpoint,
      resume: options.resume ?? false,
      retrySkipped: options.retrySkipped ?? false,
      onProgress: (message) => process.stderr.write(`${message}\n`),
    });
    const audit = auditIssueFailures(report);
    await writeArtifacts(output, {
      "report.md": renderIssueEvaluation(report),
      "results.json": `${JSON.stringify(report, null, 2)}\n`,
      "audit.md": renderIssueAudit(audit),
      "audit.json": `${JSON.stringify(audit, null, 2)}\n`,
    });
    process.stdout.write(
      `Issue evaluation: ${output}\n`
      + `Recall@10 ${report.aggregate.recallAt10.toFixed(3)}; MRR ${report.aggregate.mrr.toFixed(3)}.\n`
      + `Checkpoint: ${checkpoint}\n`,
    );
  });

program.parseAsync().catch((error: unknown) => {
  const normalized = toContextPackError(error);
  process.stderr.write(`contextpack: ${normalized.message}\n`);
  process.exitCode = normalized.exitCode;
});
