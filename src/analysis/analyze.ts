import { performance } from "node:perf_hooks";
import type { AnalysisOptions, AnalysisTimings, ContextManifest, SuggestedCommand } from "../types.js";
import { extractConventionalScope, normalizeTaskTerms } from "../utils/task-terms.js";
import { discoverRepository } from "../repository/discover.js";
import { analyzeFiles, enrichSemanticReferences } from "./ast.js";
import { readGitHistory } from "./git-history.js";
import { rankCandidates } from "../ranking/score.js";
import { selectCandidates } from "../ranking/select.js";
import { prioritizeCandidates } from "../ranking/predictions.js";

function suggestedCommands(packages: Awaited<ReturnType<typeof discoverRepository>>["packages"]): SuggestedCommand[] {
  const commands: SuggestedCommand[] = [];
  const priorities = ["test", "typecheck", "lint", "check", "build"];
  for (const packageInfo of packages) {
    for (const name of priorities) {
      if (!packageInfo.scripts[name]) continue;
      commands.push({
        name,
        command: `${name === "test" ? "npm test" : `npm run ${name}`}`,
        directory: packageInfo.directory,
        reason: `Existing ${name} script in ${packageInfo.name ?? "package"}`,
      });
      if (commands.length >= 5) return commands;
    }
  }
  return commands;
}

export async function analyzeTask(options: AnalysisOptions): Promise<ContextManifest> {
  const totalStarted = performance.now();
  const phaseDurations: Omit<AnalysisTimings, "totalMs"> = {
    discoverMs: 0,
    fileAnalysisMs: 0,
    gitHistoryMs: 0,
    initialRankingMs: 0,
    semanticEnrichmentMs: 0,
    rerankingMs: 0,
    selectionMs: 0,
  };
  let phaseStarted = performance.now();
  const repository = await discoverRepository(options.root);
  phaseDurations.discoverMs = performance.now() - phaseStarted;
  phaseStarted = performance.now();
  const files = await analyzeFiles(repository);
  phaseDurations.fileAnalysisMs = performance.now() - phaseStarted;
  const terms = normalizeTaskTerms(options.task);
  phaseStarted = performance.now();
  const history = repository.snapshot.isGitRepository
    ? readGitHistory(repository.snapshot.root, options.historyCount, new Set(repository.sourceFiles))
    : {
        commits: [],
        fileCommitCounts: new Map(),
        coChange: new Map(),
        titleTermsByFile: new Map(),
      };
  phaseDurations.gitHistoryMs = performance.now() - phaseStarted;
  const taskScope = extractConventionalScope(options.task);
  phaseStarted = performance.now();
  const initialCandidates = rankCandidates(files, terms, history, repository.rules, taskScope);
  phaseDurations.initialRankingMs = performance.now() - phaseStarted;
  phaseStarted = performance.now();
  const enriched = enrichSemanticReferences(repository, files, initialCandidates.slice(0, 12).map((candidate) => candidate.path));
  phaseDurations.semanticEnrichmentMs = performance.now() - phaseStarted;
  phaseStarted = performance.now();
  const rankedCandidates = enriched
    ? rankCandidates(files, terms, history, repository.rules, taskScope)
    : initialCandidates;
  phaseDurations.rerankingMs = enriched ? performance.now() - phaseStarted : 0;
  phaseStarted = performance.now();
  const candidates = prioritizeCandidates(rankedCandidates, { limit: 20 });
  const selected = selectCandidates(candidates, files, options.budget);
  const snippetTokens = selected.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const commands = suggestedCommands(repository.packages);
  phaseDurations.selectionMs = performance.now() - phaseStarted;
  const roundedPhases = Object.fromEntries(
    Object.entries(phaseDurations).map(([key, value]) => [key, Math.round(value)]),
  ) as Omit<AnalysisTimings, "totalMs">;
  const phaseTotal = Object.values(roundedPhases).reduce((sum, value) => sum + value, 0);
  const timings: AnalysisTimings = {
    ...roundedPhases,
    totalMs: Math.max(Math.round(performance.now() - totalStarted), phaseTotal),
  };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    repository: repository.snapshot,
    task: { raw: options.task, normalizedTerms: terms },
    budget: {
      requestedTokens: options.budget,
      estimatedTokens: snippetTokens,
      truncated: candidates.some((candidate) => !candidate.selected && candidate.score > 0),
    },
    candidates,
    selected,
    rules: repository.rules,
    commands,
    warnings: repository.warnings,
    timings,
  };
}
