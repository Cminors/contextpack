import type { ContextManifest, EvaluationReport } from "../types.js";
import type { IssueFailureAudit } from "../evaluation/issue-audit.js";
import type { IssueRankingDiagnostics, RankingEvidenceCategory } from "../evaluation/issue-diagnostics.js";
import type { IssueBenchmarkReport } from "../evaluation/issue-types.js";
import { countTokens } from "./tokens.js";

const codeFence = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension === "ts" || extension === "tsx" || extension === "mts" || extension === "cts"
    ? "typescript"
    : extension === "js" || extension === "jsx" || extension === "mjs" || extension === "cjs"
      ? "javascript"
      : extension === "json" ? "json" : "text";
};

function tableEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function composeContext(manifest: ContextManifest): string {
  const selectedByPath = new Map<string, ContextManifest["selected"][number]>();
  for (const selection of manifest.selected) {
    if (!selectedByPath.has(selection.path)) selectedByPath.set(selection.path, selection);
  }
  const selectedFiles = [...selectedByPath.values()];
  const selectedPaths = new Set(selectedByPath.keys());
  const applicableRules = manifest.rules.filter((rule) =>
    [...selectedPaths].some((filePath) => rule.scopeDirectory === "." || filePath.startsWith(`${rule.scopeDirectory}/`)),
  );
  const risk = manifest.candidates.filter((item) => !selectedPaths.has(item.path) && item.score > 0).slice(0, 8);
  const sections = [
    "# ContextPack",
    "## 1. Task",
    manifest.task.raw,
    "## 2. Repository Snapshot",
    `- Root: \`${manifest.repository.root}\`\n- Commit: \`${manifest.repository.commit}\`\n- Branch: \`${manifest.repository.branch ?? "detached"}\`\n- Project: ${manifest.repository.projectType.join(", ")}\n- Package manager: ${manifest.repository.packageManager}`,
    "## 3. Task Map",
    "| Rank | File / symbol | Lines | Score |\n|---:|---|---:|---:|\n" + manifest.candidates.slice(0, 15).map((item, index) => `| ${index + 1} | \`${item.path}${item.symbol ? `#${tableEscape(item.symbol.name)}` : ""}\` | ${item.startLine}-${item.endLine} | ${item.score.toFixed(3)} |`).join("\n"),
    "## 4. Why Included",
    selectedFiles.map((item) => `- \`${item.path}\`: ${item.reasons.join("; ")}`).join("\n") || "No snippets fit the budget.",
    "## 5. Relationships",
    selectedFiles.flatMap((item) => item.relationships.slice(0, 2).map((relation) => `- \`${item.path}\` ${relation.kind} \`${relation.target}\` (${relation.strength.toFixed(2)}): ${relation.detail}`)).join("\n") || "No direct relationships were detected.",
    "## 6. Applicable Rules",
    applicableRules.slice(0, 10).map((rule) => `- \`${rule.path}\` (${rule.kind}, scope \`${rule.scopeDirectory}\`)`).join("\n") || "No supported repository instruction files apply to the selected paths.",
    "## 7. Suggested Verification",
    manifest.commands.map((command) => `- \`${command.command}\` in \`${command.directory}\` — ${command.reason}`).join("\n") || "No package verification scripts were discovered.",
    "## 8. Risk Surface",
    risk.map((item) => `- \`${item.path}\` (score ${item.score.toFixed(3)}): relevant but omitted by rank or budget.`).join("\n") || "No additional scored candidates.",
    "## 9. Selected Snippets",
    manifest.selected.map((item) => `### \`${item.path}:${item.startLine}\`\n\n\`\`\`${codeFence(item.path)}\n${item.snippet}\n\`\`\``).join("\n\n"),
    "## 10. Budget",
    `- Requested: ${manifest.budget.requestedTokens} tokens\n- Estimated total: ${manifest.budget.estimatedTokens} tokens\n- Omitted candidates: ${manifest.candidates.filter((item) => !item.selected).length}\n- Truncated: ${manifest.budget.truncated ? "yes" : "no"}`,
  ];
  return `${sections.join("\n\n")}\n`;
}

export function renderContext(manifest: ContextManifest): string {
  const limit = Math.floor(manifest.budget.requestedTokens * 1.05);
  while (true) {
    let markdown = composeContext(manifest);
    manifest.budget.estimatedTokens = countTokens(markdown);
    markdown = composeContext(manifest);
    manifest.budget.estimatedTokens = countTokens(markdown);
    if (manifest.budget.estimatedTokens <= limit || manifest.selected.length === 0) {
      return composeContext(manifest);
    }
    const removed = manifest.selected.pop();
    if (removed) {
      const candidate = manifest.candidates.find((item) => item.path === removed.path);
      if (candidate) candidate.selected = manifest.selected.some((item) => item.path === removed.path);
      manifest.budget.truncated = true;
    }
  }
}

export function renderEvaluation(report: EvaluationReport): string {
  const rows = report.results.map((item) => `| \`${item.hash.slice(0, 8)}\` | ${tableEscape(item.query)} | ${item.redactedIdentifiers.length} | ${item.recallAt5.toFixed(2)} | ${item.recallAt10.toFixed(2)} | ${item.reciprocalRank.toFixed(2)} | ${item.estimatedTokens} |`);
  const audits = report.results.map((item) =>
    `- \`${item.hash.slice(0, 8)}\` original: ${tableEscape(item.title)}; removed: ${item.redactedIdentifiers.map((value) => `\`${value}\``).join(", ") || "none"}`,
  );
  const phases = report.aggregate.medianPhaseDurationsMs;
  return `# ContextPack Historical Replay\n\nThis report measures a retrieval proxy, not Coding Agent success.\n\n## Summary\n\n- Query mode: \`${report.queryMode}\`\n- Valid commits: ${report.validCommits}/${report.requestedCommits}\n- Recall@5: ${report.aggregate.recallAt5.toFixed(3)}\n- Recall@10: ${report.aggregate.recallAt10.toFixed(3)}\n- MRR: ${report.aggregate.mrr.toFixed(3)}\n- Noise@10: ${report.aggregate.noiseAt10.toFixed(3)}\n- Test recall: ${report.aggregate.testRecall === null ? "n/a" : report.aggregate.testRecall.toFixed(3)}\n- Median tokens: ${report.aggregate.medianTokens}\n- Median end-to-end duration: ${report.aggregate.medianDurationMs} ms\n- Median analysis duration: ${report.aggregate.medianAnalysisDurationMs} ms\n- Median render duration: ${report.aggregate.medianRenderDurationMs} ms\n- Median phases: discover ${phases.discoverMs} ms; files ${phases.fileAnalysisMs} ms; Git ${phases.gitHistoryMs} ms; initial rank ${phases.initialRankingMs} ms; semantic ${phases.semanticEnrichmentMs} ms; rerank ${phases.rerankingMs} ms; selection ${phases.selectionMs} ms\n\n## Commits\n\n| Commit | Evaluation query | Hints removed | R@5 | R@10 | MRR | Tokens |\n|---|---|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n\n## Query Audit\n\n${audits.join("\n")}\n\n## Skipped\n\n${report.skipped.map((item) => `- \`${item.hash.slice(0, 8)}\` ${tableEscape(item.title)} — ${item.reason}`).join("\n") || "None."}\n\n## Limitations\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}

export function renderIssueEvaluation(report: IssueBenchmarkReport): string {
  const budgetRows = report.lineBudgets.map((budget) => {
    const metrics = report.aggregate.regionMetrics[String(budget)];
    if (!metrics) return "";
    return `| ${budget} | ${metrics.lineRecall.toFixed(3)} | ${metrics.linePrecision.toFixed(3)} | ${metrics.lineF1.toFixed(3)} | ${metrics.hitRegionRate.toFixed(3)} | ${metrics.noiseRegionRate.toFixed(3)} | ${metrics.contextEfficiency.toFixed(3)} | ${metrics.ndcg.toFixed(3)} | ${metrics.usefulHitRate.toFixed(3)} | ${metrics.medianFirstUsefulHit ?? "n/a"} |`;
  }).filter(Boolean);
  const instanceRows = report.results.map((result) => {
    const largest = result.regionMetrics[String(report.lineBudgets.at(-1))];
    return `| \`${tableEscape(result.instanceId)}\` | \`${result.repo}\` | ${result.goldFiles.length} | ${result.recallAt5.toFixed(2)} | ${result.recallAt10.toFixed(2)} | ${result.reciprocalRank.toFixed(2)} | ${largest?.lineRecall.toFixed(2) ?? "n/a"} | ${result.estimatedTokens} | ${result.durationMs} |`;
  });
  return `# ContextPack Issue Retrieval Benchmark\n\nThis report evaluates retrieval against real issue/patch pairs. It does not execute patches or tests.\n\n## Dataset\n\n- Source: \`${report.sourceDataset}\`\n- Revision: \`${report.sourceRevision}\`\n- Valid instances: ${report.validInstances}/${report.requestedInstances}\n- Token budget: ${report.tokenBudget}\n- Line budgets: ${report.lineBudgets.join(", ")}\n\n## File Retrieval\n\n- Recall@5: ${report.aggregate.recallAt5.toFixed(3)}\n- Recall@10: ${report.aggregate.recallAt10.toFixed(3)}\n- MRR: ${report.aggregate.mrr.toFixed(3)}\n- Median tokens: ${report.aggregate.medianTokens}\n- Median duration: ${report.aggregate.medianDurationMs} ms\n\n## Line-budget Retrieval\n\n| Lines | Recall | Precision | F1 | Region hit | Region noise | Efficiency | nDCG | Useful hit | First hit |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${budgetRows.join("\n")}\n\n## Instances\n\n| Instance | Repository | Gold files | R@5 | R@10 | MRR | Recall@max lines | Tokens | Duration ms |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${instanceRows.join("\n")}\n\n## Skipped\n\n${report.skipped.map((item) => `- \`${tableEscape(item.instanceId)}\`: ${tableEscape(item.reason)}`).join("\n") || "None."}\n\n## Limitations\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}

export function renderIssueAudit(audit: IssueFailureAudit): string {
  const categoryLabels: Record<IssueFailureAudit["entries"][number]["category"], string> = {
    "file-hit-region-hit": "file hit / region hit",
    "file-hit-region-miss": "file hit / region miss",
    "file-miss-rank-11-20": "gold file ranked 11-20",
    "file-miss-outside-top-20": "gold file outside top 20",
  };
  const repositoryRows = audit.byRepository.map(({ repo, counts }) =>
    `| \`${repo}\` | ${counts.fileHitRegionHit} | ${counts.fileHitRegionMiss} | ${counts.fileMissRank11To20} | ${counts.fileMissOutsideTop20} |`,
  );
  const missRows = audit.entries
    .filter((entry) => entry.category.startsWith("file-miss"))
    .map((entry) => {
      const gold = entry.goldFiles
        .map((file) => `\`${tableEscape(file.path)}\` (${file.rank ?? ">20"})`)
        .join("<br>");
      const predictions = entry.topPredictions.slice(0, 3).map((file) => `\`${tableEscape(file)}\``).join("<br>");
      return `| \`${tableEscape(entry.instanceId)}\` | \`${entry.repo}\` | ${categoryLabels[entry.category]} | ${gold} | ${predictions} |`;
    });
  const localizationRows = audit.entries
    .filter((entry) => entry.category === "file-hit-region-miss")
    .map((entry) => {
      const gold = entry.goldFiles
        .map((file) => `\`${tableEscape(file.path)}\` (${file.rank ?? ">20"})`)
        .join("<br>");
      return `| \`${tableEscape(entry.instanceId)}\` | \`${entry.repo}\` | ${gold} |`;
    });
  const fileMissRate = audit.validInstances === 0 ? 0 : audit.counts.fileRankingMisses / audit.validInstances;

  return `# ContextPack Issue Failure Audit\n\nThis report locates retrieval failures by pipeline stage. It does not infer an unobserved scoring cause.\n\n## Summary\n\n- Valid instances: ${audit.validInstances}\n- Maximum line budget: ${audit.maximumLineBudget}\n- File hit and useful region: ${audit.counts.fileHitRegionHit}\n- File hit but region miss: ${audit.counts.fileHitRegionMiss}\n- Gold file ranked 11-20: ${audit.counts.fileMissRank11To20}\n- Gold file outside the recorded top 20: ${audit.counts.fileMissOutsideTop20}\n- Top-10 file-ranking misses: ${audit.counts.fileRankingMisses} (${(fileMissRate * 100).toFixed(1)}%)\n\n## By Repository\n\n| Repository | File + region hit | Region miss | Rank 11-20 | Outside top 20 |\n|---|---:|---:|---:|---:|\n${repositoryRows.join("\n")}\n\n## Top-10 File-ranking Misses\n\n| Instance | Repository | Stage | Gold file (recorded rank) | First three predictions |\n|---|---|---|---|---|\n${missRows.join("\n") || "| None | | | | |"}\n\n## File Hit / Region Misses\n\n| Instance | Repository | Gold file (recorded rank) |\n|---|---|---|\n${localizationRows.join("\n") || "| None | | |"}\n\n## Limitations\n\n${audit.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}

export function renderIssueDiagnostics(diagnostics: IssueRankingDiagnostics): string {
  const categoryLabels: Record<RankingEvidenceCategory, string> = {
    "candidate-not-found": "candidate not found",
    "non-finite-score": "non-finite score",
    "prediction-policy-displacement": "prediction-policy displacement",
    "no-direct-query-signal": "no lexical/symbol signal",
    "direct-signal-below-cutoff": "direct signal below cutoff",
  };
  const rows = diagnostics.entries.map((entry) => {
    const candidate = entry.bestGoldCandidate;
    return `| \`${tableEscape(entry.instanceId)}\` | \`${entry.repo}\` | ${categoryLabels[entry.category]} | \`${tableEscape(candidate.path)}\` | ${candidate.finalRank ?? "n/a"} | ${candidate.scoreRank ?? "n/a"} | ${candidate.score?.toFixed(3) ?? "n/a"} | ${entry.scoreGapToTenth?.toFixed(3) ?? "n/a"} | ${entry.dominantSignal ?? "none"} |`;
  });

  return `# ContextPack Issue Ranking Diagnostics\n\nThis report records observed ranking evidence for issue tasks whose gold files remain outside the final top 20. It does not claim a causal root cause.\n\n## Summary\n\n- Eligible outside-top-20 misses: ${diagnostics.eligibleMisses}\n- Diagnosed misses: ${diagnostics.diagnosedMisses}\n- Missing diagnostic evidence: ${diagnostics.missingEvidence.length}\n- Candidate not found: ${diagnostics.counts["candidate-not-found"]}\n- Non-finite score: ${diagnostics.counts["non-finite-score"]}\n- Prediction-policy displacement: ${diagnostics.counts["prediction-policy-displacement"]}\n- No direct lexical or symbol signal: ${diagnostics.counts["no-direct-query-signal"]}\n- Direct signal below cutoff: ${diagnostics.counts["direct-signal-below-cutoff"]}\n\n## Instances\n\n| Instance | Repository | Observed evidence | Best gold file | Final rank | Score rank | Score | Gap to 10th | Dominant signal |\n|---|---|---|---|---:|---:|---:|---:|---|\n${rows.join("\n") || "| None | | | | | | | | |"}\n\n## Missing Evidence\n\n${diagnostics.missingEvidence.map((instanceId) => `- \`${tableEscape(instanceId)}\``).join("\n") || "None."}\n\n## Limitations\n\n${diagnostics.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}
