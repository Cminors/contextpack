import path from "node:path";
import type {
  CandidateRelationship,
  ContextCandidate,
  FileAnalysis,
  GitHistoryIndex,
  RuleRecord,
  ScoreBreakdown,
  SymbolRecord,
} from "../types.js";
import { lexicalMatch } from "../utils/task-terms.js";
import { coChangeStrength } from "../analysis/git-history.js";

export const SCORE_WEIGHTS = {
  lexical: 0.28,
  symbol: 0.22,
  dependency: 0.18,
  git: 0.15,
  test: 0.1,
  rule: 0.07,
} as const;

function bestSymbol(file: FileAnalysis, terms: string[]): SymbolRecord | null {
  return [...file.symbols].sort((left, right) => {
    const delta = lexicalMatch(terms, right.name) - lexicalMatch(terms, left.name);
    return delta || Number(right.exported) - Number(left.exported) || left.startLine - right.startLine;
  })[0] ?? null;
}

function applicableRules(filePath: string, rules: RuleRecord[]): RuleRecord[] {
  return rules.filter((rule) => {
    if (rule.kind === "documentation") return false;
    if (rule.scopeDirectory !== "." && !filePath.startsWith(`${rule.scopeDirectory}/`)) return false;
    if (rule.globs.length === 0) return true;
    return rule.globs.some((glob) => {
      const plain = glob.replace(/^\*\*\//, "").replaceAll("**", "").replaceAll("*", "");
      return plain.length === 0 || filePath.includes(plain.replace(/^\//, ""));
    });
  });
}

function dependencyDistances(files: FileAnalysis[], seeds: Set<string>): Map<string, number> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const distances = new Map<string, number>();
  const queue = [...seeds].map((filePath) => ({ filePath, distance: 0 }));
  for (const seed of seeds) distances.set(seed, 0);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= 2) continue;
    const file = byPath.get(current.filePath);
    if (!file) continue;
    for (const neighbor of [...file.imports, ...file.importedBy]) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, current.distance + 1);
        queue.push({ filePath: neighbor, distance: current.distance + 1 });
      }
    }
  }
  return distances;
}

function testStrength(file: FileAnalysis, files: FileAnalysis[], seeds: Set<string>): number {
  if (file.isTest && file.imports.some((item) => seeds.has(item))) return 1;
  if (!file.isTest && files.some((item) => item.isTest && item.imports.includes(file.path) && seeds.has(file.path))) return 0.8;
  const stem = path.posix.basename(file.path).replace(/\.(?:test|spec)?\.[^.]+$/, "");
  return files.some((item) => item.path !== file.path && item.isTest && path.posix.basename(item.path).includes(stem)) ? 0.45 : 0;
}

function relationshipsFor(file: FileAnalysis, files: FileAnalysis[], history: GitHistoryIndex, seeds: Set<string>, rules: RuleRecord[]): CandidateRelationship[] {
  const relationships: CandidateRelationship[] = [];
  for (const target of file.imports.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "imports", target, strength: 1, detail: "Direct import of a lexical seed" });
  }
  for (const target of file.importedBy.filter((item) => seeds.has(item)).slice(0, 3)) {
    relationships.push({ kind: "imported-by", target, strength: 1, detail: "Imported by a lexical seed" });
  }
  if (file.isTest) {
    for (const target of file.imports.filter((item) => seeds.has(item)).slice(0, 3)) {
      relationships.push({ kind: "test-for", target, strength: 1, detail: "Test directly imports a lexical seed" });
    }
  }
  const strongest = [...seeds]
    .map((target) => ({ target, strength: coChangeStrength(history, file.path, target) }))
    .filter((item) => item.strength > 0)
    .sort((a, b) => b.strength - a.strength || a.target.localeCompare(b.target))[0];
  if (strongest) relationships.push({ kind: "co-change", ...strongest, detail: "Changed together in local Git history" });
  for (const rule of applicableRules(file.path, rules).slice(0, 2)) {
    relationships.push({ kind: "rule-applies", target: rule.path, strength: 1, detail: "Rule scope includes this path" });
  }
  return relationships;
}

export function rankCandidates(files: FileAnalysis[], terms: string[], history: GitHistoryIndex, rules: RuleRecord[]): ContextCandidate[] {
  const rawRelevance = new Map<string, { lexical: number; symbol: number }>();
  for (const file of files) {
    const lexical = lexicalMatch(terms, file.path);
    const symbolScore = file.symbols.reduce((best, item) => Math.max(best, lexicalMatch(terms, item.name)), 0);
    const titleScore = lexicalMatch(terms, [...(history.titleTermsByFile.get(file.path) ?? [])].join(" "));
    rawRelevance.set(file.path, { lexical: Math.max(lexical, titleScore * 0.65), symbol: symbolScore });
  }
  let seeds = new Set([...rawRelevance].filter(([, value]) => Math.max(value.lexical, value.symbol) > 0).map(([filePath]) => filePath));
  if (seeds.size === 0) {
    seeds = new Set(files.filter((file) => !file.isConfig).slice(0, 3).map((file) => file.path));
  }
  const distances = dependencyDistances(files, seeds);

  return files.map((file) => {
    const relevance = rawRelevance.get(file.path) ?? { lexical: 0, symbol: 0 };
    const distance = distances.get(file.path);
    const dependency = distance === 0 ? 0.65 : distance === 1 ? 1 : distance === 2 ? 0.55 : 0;
    const coChange = Math.max(0, ...[...seeds].map((seed) => coChangeStrength(history, file.path, seed)));
    const title = lexicalMatch(terms, [...(history.titleTermsByFile.get(file.path) ?? [])].join(" "));
    const test = testStrength(file, files, seeds);
    const rule = Math.min(1, applicableRules(file.path, rules).length * 0.5 + (file.isConfig ? 0.35 : 0));
    const breakdown: ScoreBreakdown = {
      lexical: relevance.lexical,
      symbol: relevance.symbol,
      dependency,
      git: Math.max(coChange, title * 0.7),
      test,
      rule,
    };
    const score = Object.entries(SCORE_WEIGHTS).reduce(
      (total, [key, weight]) => total + breakdown[key as keyof ScoreBreakdown] * weight,
      0,
    );
    const reasons = (Object.keys(SCORE_WEIGHTS) as Array<keyof ScoreBreakdown>)
      .filter((key) => breakdown[key] > 0)
      .sort((a, b) => breakdown[b] * SCORE_WEIGHTS[b] - breakdown[a] * SCORE_WEIGHTS[a])
      .slice(0, 3)
      .map((key) => `${key} signal ${breakdown[key].toFixed(2)}`);
    const chosenSymbol = bestSymbol(file, terms);
    return {
      path: file.path,
      symbol: chosenSymbol,
      startLine: chosenSymbol?.startLine ?? 1,
      endLine: chosenSymbol?.endLine ?? Math.min(file.lineCount, 120),
      score: Number(score.toFixed(6)),
      breakdown,
      selected: false,
      reasons: reasons.length > 0 ? reasons : ["deterministic repository fallback"],
      relationships: relationshipsFor(file, files, history, seeds, rules),
      estimatedTokens: 0,
    };
  }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}
