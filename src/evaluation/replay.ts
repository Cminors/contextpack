import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import type { EvaluationQueryMode, EvaluationReport, EvaluationSkip, GitCommitRecord } from "../types.js";
import { ContextPackError } from "../errors.js";
import { analyzeTask } from "../analysis/analyze.js";
import { discoverRepository } from "../repository/discover.js";
import { gitStatusFingerprint, runGit } from "../utils/git.js";
import { toPosixPath } from "../utils/path.js";
import { aggregateMetrics, commitMetrics } from "./metrics.js";
import { renderContext } from "../output/markdown.js";

const SOURCE = /\.[cm]?[jt]sx?$/i;
const SKIP_TITLE = /\b(?:release|version|bump|deps?|dependencies|lockfile|format(?:ting)?|lint fixes?)\b/i;
const FEATURE_TITLE = /^(?:feat(?:ure)?(?:\([^)]*\))?!?:|add\b|implement\b|introduce\b|support\b)/i;
const MARKER = "---CONTEXTPACK-EVAL---";
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function declarationNames(source: ts.SourceFile): string[] {
  const names = new Set<string>();
  const addName = (name: ts.PropertyName | ts.BindingName | undefined): void => {
    if (!name) return;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) names.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const value of bindingNames(name)) names.add(value);
    }
  };
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      addName(statement.name);
      if (ts.isClassDeclaration(statement)) {
        for (const member of statement.members) {
          if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) addName(member.name);
        }
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) addName(declaration.name);
    }
  }
  return [...names];
}

function scriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

async function identifiersFromGoldFiles(root: string, goldFiles: string[]): Promise<Set<string>> {
  const identifiers = new Set<string>();
  for (const filePath of goldFiles) {
    const normalized = toPosixPath(filePath);
    const withoutExtension = normalized.replace(/\.[^.\/]+$/, "");
    identifiers.add(normalized);
    identifiers.add(path.posix.basename(normalized));
    identifiers.add(path.posix.basename(withoutExtension));
    const content = await fs.readFile(path.join(root, filePath), "utf8");
    const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind(filePath));
    for (const name of declarationNames(source)) {
      if (name.length >= 3) identifiers.add(name);
    }
  }
  return identifiers;
}

export function redactTaskTitle(
  title: string,
  goldFiles: string[],
  declarationIdentifiers: Iterable<string> = [],
): { query: string; redactedIdentifiers: string[] } {
  const identifiers = new Set<string>();
  const pathSegments = new Set<string>();
  for (const filePath of goldFiles) {
    const normalized = toPosixPath(filePath);
    const withoutExtension = normalized.replace(/\.[^.\/]+$/, "");
    identifiers.add(normalized);
    identifiers.add(path.posix.basename(normalized));
    identifiers.add(path.posix.basename(withoutExtension));
    for (const segment of withoutExtension.split("/")) pathSegments.add(segment.toLowerCase());
  }
  const conventionalScope = /^(?:feat(?:ure)?|add|implement|introduce|support)\(([^)]+)\):/i.exec(title)?.[1];
  if (conventionalScope && pathSegments.has(conventionalScope.toLowerCase())) identifiers.add(conventionalScope);
  for (const identifier of declarationIdentifiers) {
    if (identifier.length >= 3) identifiers.add(identifier);
  }
  const redactedIdentifiers: string[] = [];
  let query = title;
  for (const identifier of [...identifiers].sort((left, right) => right.length - left.length || left.localeCompare(right))) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`, "giu");
    if (!pattern.test(query)) continue;
    query = query.replace(pattern, " ");
    redactedIdentifiers.push(identifier);
  }
  query = query
    .replace(/^(?:(?:feat(?:ure)?|add|implement|introduce|support)\(\s*\)!?:|feat(?:ure)?!?:)\s*/i, "")
    .replace(/\(#\d+\)/g, "")
    .replace(/\s*\.\s*(?=\p{L})/gu, " ")
    .replace(/\s+([:;,.()])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(query)) query = "feature change";
  return { query, redactedIdentifiers };
}

function listCommits(root: string, count: number): GitCommitRecord[] {
  const result = runGit(root, ["log", "--no-merges", `-n${Math.max(count * 20, count)}`, "--name-only", `--format=${MARKER}%H%x09%P%x09%s`]);
  if (!result.ok) throw new ContextPackError(`Cannot read Git history: ${result.stderr}`, 3, "GIT_HISTORY_FAILED");
  const records: GitCommitRecord[] = [];
  let current: (GitCommitRecord & { parents: string[] }) | null = null;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith(MARKER)) {
      if (current) records.push(current);
      const [hash = "", parents = "", ...title] = line.slice(MARKER.length).split("\t");
      current = { hash, title: title.join("\t"), files: [], parents: parents.split(" ").filter(Boolean) };
    } else if (current && line.trim()) {
      const file = toPosixPath(line.trim());
      if (SOURCE.test(file)) current.files.push(file);
    }
  }
  if (current) records.push(current);
  return records;
}

export async function runReplay(
  root: string,
  requestedCommits: number,
  budget: number,
  queryMode: EvaluationQueryMode = "title",
): Promise<EvaluationReport> {
  const repository = await discoverRepository(root);
  if (!repository.snapshot.isGitRepository) throw new ContextPackError("Historical replay requires a Git repository.", 2, "GIT_REQUIRED");
  const originalFingerprint = gitStatusFingerprint(repository.snapshot.root);
  const results: EvaluationReport["results"] = [];
  const skipped: EvaluationSkip[] = [];
  const commits = listCommits(repository.snapshot.root, requestedCommits);

  for (const commit of commits) {
    if (results.length >= requestedCommits) break;
    const parent = runGit(repository.snapshot.root, ["rev-parse", `${commit.hash}^`]);
    const unique = [...new Set(commit.files)];
    let reason: string | null = null;
    if (!parent.ok) reason = "commit has no replayable parent";
    else if (SKIP_TITLE.test(commit.title)) reason = "mechanical, release, or dependency commit";
    else if (!FEATURE_TITLE.test(commit.title)) reason = "outside the feature-addition task scope";
    else if (unique.length < 1 || unique.length > 15) reason = "outside the 1-15 source-file feature scope";
    if (reason) {
      skipped.push({ hash: commit.hash, title: commit.title, reason });
      continue;
    }

    const goldFiles = unique.filter((file) => runGit(repository.snapshot.root, ["cat-file", "-e", `${parent.stdout}:${file}`]).ok);
    if (goldFiles.length === 0) {
      skipped.push({ hash: commit.hash, title: commit.title, reason: "all changed source files were newly added" });
      continue;
    }

    const base = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-"));
    let attached = false;
    try {
      const add = runGit(repository.snapshot.root, ["worktree", "add", "--detach", base, parent.stdout]);
      if (!add.ok) throw new Error(add.stderr || "worktree creation failed");
      attached = true;
      const identifiers = queryMode === "keyword-ablated" ? await identifiersFromGoldFiles(base, goldFiles) : new Set<string>();
      const queryData = queryMode === "keyword-ablated"
        ? redactTaskTitle(commit.title, goldFiles, identifiers)
        : { query: commit.title, redactedIdentifiers: [] };
      const started = performance.now();
      const manifest = await analyzeTask({ root: base, task: queryData.query, budget, historyCount: 500 });
      const renderStarted = performance.now();
      renderContext(manifest);
      const renderDurationMs = Math.round(performance.now() - renderStarted);
      const durationMs = Math.round(performance.now() - started);
      const predictions = manifest.candidates.slice(0, 20).map((item) => item.path);
      results.push({
        hash: commit.hash,
        title: commit.title,
        query: queryData.query,
        redactedIdentifiers: queryData.redactedIdentifiers,
        goldFiles,
        predictions,
        ...commitMetrics(goldFiles, predictions),
        estimatedTokens: manifest.budget.estimatedTokens,
        durationMs,
        analysisTimings: manifest.timings,
        renderDurationMs,
      });
    } catch (error) {
      skipped.push({ hash: commit.hash, title: commit.title, reason: `replay failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      if (attached) runGit(repository.snapshot.root, ["worktree", "remove", "--force", base]);
      await fs.rm(base, { recursive: true, force: true });
    }
  }

  if (gitStatusFingerprint(repository.snapshot.root) !== originalFingerprint) {
    throw new ContextPackError("Evaluation stopped because the user workspace fingerprint changed.", 3, "WORKSPACE_CHANGED");
  }
  if (results.length === 0) throw new ContextPackError("No valid historical commits were available for replay.", 4, "NO_VALID_COMMITS");
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    repository: repository.snapshot,
    queryMode,
    requestedCommits,
    validCommits: results.length,
    results,
    skipped,
    aggregate: aggregateMetrics(results),
    limitations: [
      "Changed files are an imperfect proxy for the ideal context set.",
      "Commit titles can underspecify the original feature task.",
      queryMode === "keyword-ablated"
        ? "Keyword ablation removes exact gold path and declaration hints but does not create a natural-language paraphrase."
        : "Title mode can contain exact path or declaration hints and should be compared with keyword-ablated results.",
      "Retrieval recall does not measure whether a Coding Agent completes the task successfully.",
    ],
  };
}
