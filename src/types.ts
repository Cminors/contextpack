export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export type RelationshipKind =
  | "imports"
  | "imported-by"
  | "references"
  | "referenced-by"
  | "test-for"
  | "co-change"
  | "rule-applies";

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "method"
  | "module";

export interface RepositorySnapshot {
  root: string;
  commit: string;
  branch: string | null;
  packageManager: PackageManager;
  projectType: string[];
  isGitRepository: boolean;
  isShallow: boolean;
}

export interface PackageInfo {
  directory: string;
  name: string | null;
  scripts: Record<string, string>;
}

export interface SymbolRecord {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  exported: boolean;
  text: string;
}

export type LexicalContentField = "comment" | "identifier" | "string" | "test-title";

export interface LexicalOccurrence {
  term: string;
  field: LexicalContentField;
  line: number;
}

export interface LexicalDocument {
  length: number;
  termWeights: Record<string, number>;
  occurrences: LexicalOccurrence[];
}

export interface FileAnalysis {
  path: string;
  absolutePath: string;
  language: "javascript" | "typescript" | "json" | "markdown";
  content: string;
  lineCount: number;
  imports: string[];
  importedBy: string[];
  references: string[];
  referencedBy: string[];
  referenceSymbols: Record<string, string[]>;
  symbols: SymbolRecord[];
  isTest: boolean;
  isConfig: boolean;
  packageDirectory: string | null;
  lexicalDocument?: LexicalDocument;
}

export interface RuleRecord {
  path: string;
  scopeDirectory: string;
  globs: string[];
  content: string;
  kind: "agents" | "claude" | "copilot" | "cursor" | "documentation";
}

export interface GitCommitRecord {
  hash: string;
  title: string;
  files: string[];
}

export interface GitHistoryIndex {
  commits: GitCommitRecord[];
  fileCommitCounts: Map<string, number>;
  coChange: Map<string, Map<string, number>>;
  titleTermsByFile: Map<string, Set<string>>;
}

export interface ScoreBreakdown {
  lexical: number;
  symbol: number;
  dependency: number;
  git: number;
  test: number;
  rule: number;
}

export interface CandidateRelationship {
  kind: RelationshipKind;
  target: string;
  strength: number;
  detail: string;
}

export interface ContextCandidate {
  path: string;
  symbol: SymbolRecord | null;
  startLine: number;
  endLine: number;
  score: number;
  breakdown: ScoreBreakdown;
  selected: boolean;
  reasons: string[];
  relationships: CandidateRelationship[];
  estimatedTokens: number;
  alternateRegions?: Array<{
    symbol: SymbolRecord | null;
    startLine: number;
    endLine: number;
  }>;
}

export interface PredictionOptions {
  limit: number;
  maxTests?: number;
  maxConfigs?: number;
  maxExamples?: number;
  maxBarrels?: number;
}

export interface ContextSelection extends ContextCandidate {
  snippet: string;
}

export interface SuggestedCommand {
  name: string;
  command: string;
  directory: string;
  reason: string;
}

export interface ContextWarning {
  code: string;
  message: string;
  path?: string;
}

export interface AnalysisTimings {
  discoverMs: number;
  fileAnalysisMs: number;
  gitHistoryMs: number;
  initialRankingMs: number;
  semanticEnrichmentMs: number;
  rerankingMs: number;
  selectionMs: number;
  totalMs: number;
}

export interface ContextManifest {
  version: 1;
  generatedAt: string;
  repository: RepositorySnapshot;
  task: {
    raw: string;
    normalizedTerms: string[];
  };
  budget: {
    requestedTokens: number;
    estimatedTokens: number;
    truncated: boolean;
  };
  candidates: ContextCandidate[];
  selected: ContextSelection[];
  rules: RuleRecord[];
  commands: SuggestedCommand[];
  warnings: ContextWarning[];
  timings: AnalysisTimings;
}

export interface AnalysisOptions {
  root: string;
  task: string;
  budget: number;
  historyCount: number;
}

export interface DiscoveredRepository {
  snapshot: RepositorySnapshot;
  sourceFiles: string[];
  configFiles: string[];
  packages: PackageInfo[];
  rules: RuleRecord[];
  warnings: ContextWarning[];
}

export interface EvaluationCommitResult {
  hash: string;
  title: string;
  query: string;
  redactedIdentifiers: string[];
  goldFiles: string[];
  predictions: string[];
  recallAt5: number;
  recallAt10: number;
  reciprocalRank: number;
  noiseAt10: number;
  testRecall: number | null;
  estimatedTokens: number;
  durationMs: number;
  analysisTimings?: AnalysisTimings;
  renderDurationMs?: number;
}

export type EvaluationQueryMode = "title" | "keyword-ablated";

export interface EvaluationSkip {
  hash: string;
  title: string;
  reason: string;
}

export interface EvaluationReport {
  version: 2;
  generatedAt: string;
  repository: RepositorySnapshot;
  queryMode: EvaluationQueryMode;
  requestedCommits: number;
  validCommits: number;
  results: EvaluationCommitResult[];
  skipped: EvaluationSkip[];
  aggregate: {
    recallAt5: number;
    recallAt10: number;
    mrr: number;
    noiseAt10: number;
    testRecall: number | null;
    medianTokens: number;
    medianDurationMs: number;
    medianAnalysisDurationMs: number;
    medianRenderDurationMs: number;
    medianPhaseDurationsMs: AnalysisTimings;
  };
  limitations: string[];
}
