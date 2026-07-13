import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { analyzeTask } from "./analysis/analyze.js";
import { runReplay } from "./evaluation/replay.js";
import { renderContext, renderEvaluation } from "./output/markdown.js";
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

program.parseAsync().catch((error: unknown) => {
  const normalized = toContextPackError(error);
  process.stderr.write(`contextpack: ${normalized.message}\n`);
  process.exitCode = normalized.exitCode;
});
