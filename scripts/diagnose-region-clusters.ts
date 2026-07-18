import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFiles } from "../src/analysis/ast.js";
import { readGitHistory } from "../src/analysis/git-history.js";
import type { IssueFailureAudit } from "../src/evaluation/issue-audit.js";
import type {
  GoldPatchRegion,
  IssueBenchmarkInstance,
  IssueBenchmarkReport,
} from "../src/evaluation/issue-types.js";
import { readIssueDataset } from "../src/evaluation/swebench-dataset.js";
import { discoverRepository } from "../src/repository/discover.js";
import { scoreContentMatches } from "../src/ranking/lexical.js";
import {
  locateTopRegionCandidates,
  type LocatedRegionCandidate,
} from "../src/ranking/regions.js";
import { rankCandidates } from "../src/ranking/score.js";
import { runGit } from "../src/utils/git.js";
import { extractConventionalScope, normalizeTaskTerms } from "../src/utils/task-terms.js";

export interface RegionCandidateClassification {
  candidateOverlaps: boolean[];
  primaryOverlapsGold: boolean;
  alternateOverlapsGold: boolean;
  alternateHelpful: boolean;
}

export function classifyRegionCandidates(
  filePath: string,
  candidates: LocatedRegionCandidate[],
  goldRegions: GoldPatchRegion[],
): RegionCandidateClassification {
  const relevantGold = goldRegions.filter((region) => region.path === filePath);
  const candidateOverlaps = candidates.map((candidate) => relevantGold.some((gold) =>
    candidate.startLine <= gold.endLine && gold.startLine <= candidate.endLine));
  const primaryOverlapsGold = candidateOverlaps[0] ?? false;
  const alternateOverlapsGold = candidateOverlaps.slice(1).some(Boolean);
  return {
    candidateOverlaps,
    primaryOverlapsGold,
    alternateOverlapsGold,
    alternateHelpful: !primaryOverlapsGold && alternateOverlapsGold,
  };
}

interface FileDiagnostic {
  instanceId: string;
  repo: string;
  path: string;
  predictionRank: number;
  currentPrimary: { startLine: number; endLine: number } | null;
  proposalPrimaryMatchesCandidate: boolean;
  candidates: Array<{
    startLine: number;
    endLine: number;
    distinctTerms: number;
    evidence: Array<{ term: string; field: string; line: number }>;
    overlapsGold: boolean;
  }>;
  primaryOverlapsGold: boolean;
  alternateOverlapsGold: boolean;
  alternateHelpful: boolean;
}

interface RegionDiagnosticReport {
  version: 1;
  generatedAt: string;
  sourceReport: string;
  regionMissInstances: number;
  requiredHelpfulInstances: number;
  helpfulInstances: string[];
  files: FileDiagnostic[];
}

function sameRegion(
  left: { startLine: number; endLine: number } | undefined,
  right: { startLine: number; endLine: number } | undefined,
): boolean {
  return left !== undefined && right !== undefined
    && left.startLine === right.startLine
    && left.endLine === right.endLine;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function diagnoseInstance(
  root: string,
  cacheDirectory: string,
  entry: IssueFailureAudit["entries"][number],
  instance: IssueBenchmarkInstance,
  benchmark: IssueBenchmarkReport["results"][number],
): Promise<FileDiagnostic[]> {
  const cache = path.join(cacheDirectory, `${instance.repo.replace("/", "__")}.git`);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-p09-"));
  const checkout = path.join(temporaryRoot, "repo");
  const added = runGit(cache, ["worktree", "add", "--detach", checkout, instance.baseCommit], { timeoutMs: 300_000 });
  if (!added.ok) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    throw new Error(`Cannot create diagnostic checkout for ${instance.instanceId}: ${added.stderr}`);
  }

  try {
    const repository = await discoverRepository(checkout);
    const files = await analyzeFiles(repository);
    const terms = normalizeTaskTerms(instance.issueText);
    const matches = scoreContentMatches(files, terms);
    const history = readGitHistory(checkout, 100, new Set(repository.sourceFiles));
    const ranked = rankCandidates(
      files,
      terms,
      history,
      repository.rules,
      extractConventionalScope(instance.issueText),
    );
    const filesByPath = new Map(files.map((file) => [file.path, file]));
    const candidatesByPath = new Map(ranked.map((candidate) => [candidate.path, candidate]));
    const diagnostics: FileDiagnostic[] = [];

    for (const goldFile of entry.goldFiles.filter(({ rank }) => rank !== null && rank <= 10)) {
      const file = filesByPath.get(goldFile.path);
      const match = matches.get(goldFile.path);
      const currentCandidate = candidatesByPath.get(goldFile.path);
      const proposals = file && match
        ? locateTopRegionCandidates(file, match.localizationEvidence, 3)
        : [];
      const classification = classifyRegionCandidates(goldFile.path, proposals, instance.goldRegions);
      const proposalPrimaryMatchesCandidate = sameRegion(proposals[0], currentCandidate);
      diagnostics.push({
        instanceId: instance.instanceId,
        repo: instance.repo,
        path: goldFile.path,
        predictionRank: benchmark.predictions.indexOf(goldFile.path) + 1,
        currentPrimary: currentCandidate
          ? { startLine: currentCandidate.startLine, endLine: currentCandidate.endLine }
          : null,
        proposalPrimaryMatchesCandidate,
        candidates: proposals.map((proposal, index) => ({
          startLine: proposal.startLine,
          endLine: proposal.endLine,
          distinctTerms: proposal.distinctTerms,
          evidence: proposal.evidence.map(({ term, field, line }) => ({ term, field, line })),
          overlapsGold: classification.candidateOverlaps[index] ?? false,
        })),
        primaryOverlapsGold: classification.primaryOverlapsGold,
        alternateOverlapsGold: classification.alternateOverlapsGold,
        alternateHelpful: proposalPrimaryMatchesCandidate && classification.alternateHelpful,
      });
    }

    return diagnostics;
  } finally {
    runGit(cache, ["worktree", "remove", "--force", checkout], { timeoutMs: 300_000 });
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function renderReport(report: RegionDiagnosticReport): string {
  const rows = report.files.map((file) =>
    `| \`${file.instanceId}\` | \`${file.path}\` | ${file.predictionRank} | ${file.candidates.length} | ${file.proposalPrimaryMatchesCandidate ? "yes" : "no"} | ${file.alternateHelpful ? "yes" : "no"} |`);
  return `# P0.9 Region Cluster Diagnostic\n\n`
    + `- P0.8 region-miss instances: ${report.regionMissInstances}\n`
    + `- Required helpful instances: ${report.requiredHelpfulInstances}\n`
    + `- Helpful instances: ${report.helpfulInstances.length}\n\n`
    + `| Instance | Gold file | Rank | Proposals | Primary matches current | Alternate helpful |\n`
    + `|---|---|---:|---:|---|---|\n${rows.join("\n")}\n`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const auditPath = path.join(root, ".contextpack", "evals", "p08-full-43", "audit.json");
  const resultsPath = path.join(root, ".contextpack", "evals", "p08-full-43", "results.json");
  const datasetPath = path.join(root, ".benchmarks", "datasets", "swe-bench-multilingual-js-ts.jsonl");
  const cacheDirectory = path.join(root, ".benchmarks", "repositories");
  const outputDirectory = path.join(root, ".contextpack", "evals", "p09-region-diagnostic");
  const [audit, benchmark, instances] = await Promise.all([
    readJson<IssueFailureAudit>(auditPath),
    readJson<IssueBenchmarkReport>(resultsPath),
    readIssueDataset(datasetPath),
  ]);
  if (benchmark.validInstances !== 43 || benchmark.skipped.length !== 0) {
    throw new Error("P0.8 diagnostic input must contain 43 valid instances and zero skips.");
  }
  const misses = audit.entries.filter((entry) => entry.category === "file-hit-region-miss");
  const instanceById = new Map(instances.map((instance) => [instance.instanceId, instance]));
  const resultById = new Map(benchmark.results.map((result) => [result.instanceId, result]));
  const files: FileDiagnostic[] = [];

  for (const [index, entry] of misses.entries()) {
    const instance = instanceById.get(entry.instanceId);
    const result = resultById.get(entry.instanceId);
    if (!instance || !result) throw new Error(`Missing P0.8 diagnostic input for ${entry.instanceId}`);
    process.stderr.write(`[${index + 1}/${misses.length}] ${entry.instanceId}\n`);
    files.push(...await diagnoseInstance(root, cacheDirectory, entry, instance, result));
  }

  const helpfulInstances = [...new Set(files
    .filter((file) => file.alternateHelpful)
    .map((file) => file.instanceId))].sort();
  const report: RegionDiagnosticReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceReport: path.relative(root, resultsPath).replaceAll("\\", "/"),
    regionMissInstances: misses.length,
    requiredHelpfulInstances: Math.max(3, Math.ceil(misses.length * 0.25)),
    helpfulInstances,
    files,
  };
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, "results.json"), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(outputDirectory, "report.md"), renderReport(report)),
  ]);
  process.stdout.write(`Region diagnostic: ${outputDirectory}\nHelpful instances: ${helpfulInstances.length}/${misses.length}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
