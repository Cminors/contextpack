import type { AnalysisOptions, ContextManifest, SuggestedCommand } from "../types.js";
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
  const repository = await discoverRepository(options.root);
  const files = await analyzeFiles(repository);
  const terms = normalizeTaskTerms(options.task);
  const history = repository.snapshot.isGitRepository
    ? readGitHistory(repository.snapshot.root, options.historyCount, new Set(repository.sourceFiles))
    : {
        commits: [],
        fileCommitCounts: new Map(),
        coChange: new Map(),
        titleTermsByFile: new Map(),
      };
  const taskScope = extractConventionalScope(options.task);
  const initialCandidates = rankCandidates(files, terms, history, repository.rules, taskScope);
  const enriched = enrichSemanticReferences(repository, files, initialCandidates.slice(0, 12).map((candidate) => candidate.path));
  const rankedCandidates = enriched
    ? rankCandidates(files, terms, history, repository.rules, taskScope)
    : initialCandidates;
  const candidates = prioritizeCandidates(rankedCandidates, { limit: 20 });
  const selected = selectCandidates(candidates, files, options.budget);
  const snippetTokens = selected.reduce((sum, item) => sum + item.estimatedTokens, 0);

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
    commands: suggestedCommands(repository.packages),
    warnings: repository.warnings,
  };
}
