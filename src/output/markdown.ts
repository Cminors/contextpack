import type { ContextManifest, EvaluationReport } from "../types.js";
import { countTokens } from "./tokens.js";

const codeFence = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === "ts" || extension === "tsx" || extension === "mts" || extension === "cts"
    ? "typescript"
    : extension === "js" || extension === "jsx" || extension === "mjs" || extension === "cjs"
      ? "javascript"
      : extension === "json" ? "json" : "text";
};

function tableEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderContext(manifest: ContextManifest): string {
  const selectedPaths = new Set(manifest.selected.map((item) => item.path));
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
    manifest.selected.map((item) => `- \`${item.path}\`: ${item.reasons.join("; ")}`).join("\n") || "No snippets fit the budget.",
    "## 5. Relationships",
    manifest.selected.flatMap((item) => item.relationships.map((relation) => `- \`${item.path}\` ${relation.kind} \`${relation.target}\` (${relation.strength.toFixed(2)}): ${relation.detail}`)).join("\n") || "No direct relationships were detected.",
    "## 6. Applicable Rules",
    applicableRules.slice(0, 10).map((rule) => `- \`${rule.path}\` (${rule.kind}, scope \`${rule.scopeDirectory}\`)`).join("\n") || "No supported repository instruction files apply to the selected paths.",
    "## 7. Suggested Verification",
    manifest.commands.map((command) => `- \`${command.command}\` in \`${command.directory}\` — ${command.reason}`).join("\n") || "No package verification scripts were discovered.",
    "## 8. Risk Surface",
    risk.map((item) => `- \`${item.path}\` (score ${item.score.toFixed(3)}): relevant but omitted by rank or budget.`).join("\n") || "No additional scored candidates.",
    "## 9. Selected Snippets",
    manifest.selected.map((item) => `### \`${item.path}:${item.startLine}\`\n\n\`\`\`${codeFence(item.path)}\n${item.snippet}\n\`\`\``).join("\n\n"),
    "## 10. Budget",
    `- Requested: ${manifest.budget.requestedTokens} tokens\n- Estimated snippets: ${manifest.budget.estimatedTokens} tokens\n- Omitted candidates: ${manifest.candidates.filter((item) => !item.selected).length}\n- Truncated: ${manifest.budget.truncated ? "yes" : "no"}`,
  ];
  const markdown = `${sections.join("\n\n")}\n`;
  manifest.budget.estimatedTokens = countTokens(markdown);
  return markdown;
}

export function renderEvaluation(report: EvaluationReport): string {
  const rows = report.results.map((item) => `| \`${item.hash.slice(0, 8)}\` | ${tableEscape(item.title)} | ${item.recallAt5.toFixed(2)} | ${item.recallAt10.toFixed(2)} | ${item.reciprocalRank.toFixed(2)} | ${item.estimatedTokens} |`);
  return `# ContextPack Historical Replay\n\nThis report measures a retrieval proxy, not Coding Agent success.\n\n## Summary\n\n- Valid commits: ${report.validCommits}/${report.requestedCommits}\n- Recall@5: ${report.aggregate.recallAt5.toFixed(3)}\n- Recall@10: ${report.aggregate.recallAt10.toFixed(3)}\n- MRR: ${report.aggregate.mrr.toFixed(3)}\n- Noise@10: ${report.aggregate.noiseAt10.toFixed(3)}\n- Median tokens: ${report.aggregate.medianTokens}\n- Median duration: ${report.aggregate.medianDurationMs} ms\n\n## Commits\n\n| Commit | Task title | R@5 | R@10 | MRR | Tokens |\n|---|---|---:|---:|---:|---:|\n${rows.join("\n")}\n\n## Skipped\n\n${report.skipped.map((item) => `- \`${item.hash.slice(0, 8)}\` ${tableEscape(item.title)} — ${item.reason}`).join("\n") || "None."}\n\n## Limitations\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}
