import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { AnalysisOptions, AnalysisTimings, ContextManifest, SuggestedCommand } from "../types.js";
import { extractConventionalScope, normalizeTaskTerms } from "../utils/task-terms.js";
import { discoverRepository } from "../repository/discover.js";
import { analyzeFiles, enrichSemanticReferences } from "./ast.js";
import { readGitHistory } from "./git-history.js";
import { rankCandidates } from "../ranking/score.js";
import { selectCandidates } from "../ranking/select.js";
import { prioritizeCandidates } from "../ranking/predictions.js";

type Repository = Awaited<ReturnType<typeof discoverRepository>>;

interface PythonCommandEvidence {
  pytest: boolean;
  ruff: boolean;
  mypy: boolean;
  build: boolean;
}

const emptyPythonEvidence = (): PythonCommandEvidence => ({ pytest: false, ruff: false, mypy: false, build: false });

const configDirectory = (filePath: string): string => {
  const directory = path.posix.dirname(filePath);
  return directory === "" ? "." : directory;
};

const hasSection = (content: string, section: string): boolean => {
  const escaped = section.replaceAll(".", "\\.");
  return new RegExp(`^\\s*\\[${escaped}(?:[.\\]]|$)`, "im").test(content);
};

const stripConfigComment = (line: string): string => {
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === "\"") quote = character;
    else if (character === "#") return line.slice(0, index).trim();
  }
  return line.trim();
};

const PYTEST_REQUIREMENT = /^pytest(?:\[[A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*\])?(?:(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9*+!._-]+)(?:\s*,\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9*+!._-]+)*|\s*@\s*\S+)?(?:\s*;\s*(?:python_version|python_full_version|os_name|sys_platform|platform_release|platform_system|platform_version|platform_machine|platform_python_implementation|implementation_name|implementation_version|extra)\b.+)?$/i;

const normalizeDependencyCandidate = (value: string): string =>
  value.trim().replace(/^[\s[({,]+/, "").replace(/[\s\])},]+$/, "").trim();

const containsPytestRequirement = (value: string): boolean => {
  const candidates = [value];
  for (const match of value.matchAll(/(["'])(.*?)\1/g)) {
    if (match[2]) candidates.push(match[2]);
  }
  return candidates.some((candidate) => PYTEST_REQUIREMENT.test(normalizeDependencyCandidate(candidate)));
};

const hasRequirementsPytest = (content: string): boolean => content.split(/\r?\n/)
  .some((line) => {
    const uncommented = stripConfigComment(line);
    return uncommented !== "" && PYTEST_REQUIREMENT.test(normalizeDependencyCandidate(uncommented));
  });

const hasSetupCfgPytest = (content: string): boolean => {
  let section = "";
  let dependencyContinuation = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const uncommented = stripConfigComment(rawLine);
    if (!uncommented) continue;
    const sectionMatch = uncommented.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1].toLowerCase();
      dependencyContinuation = false;
      continue;
    }
    const assignment = uncommented.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (section === "options.extras_require") {
      if (assignment) {
        dependencyContinuation = true;
        if (assignment[2] && containsPytestRequirement(assignment[2])) return true;
      } else if (dependencyContinuation && /^\s/.test(rawLine) && containsPytestRequirement(uncommented)) {
        return true;
      }
      continue;
    }
    if (section === "options") {
      if (assignment) {
        const field = assignment[1]?.toLowerCase();
        dependencyContinuation = field === "install_requires" || field === "tests_require";
        if (dependencyContinuation && assignment[2] && containsPytestRequirement(assignment[2])) return true;
      } else if (dependencyContinuation && /^\s/.test(rawLine) && containsPytestRequirement(uncommented)) {
        return true;
      } else {
        dependencyContinuation = false;
      }
    }
  }
  return false;
};

interface PythonExpression {
  text: string;
  consumed: number;
}

const firstPythonExpression = (value: string): PythonExpression => {
  const start = value.search(/\S/);
  if (start < 0) return { text: "", consumed: value.length };
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  let depth = 0;
  let sawBracket = false;
  const quotedRoot = value[start] === "'" || value[start] === "\"";
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) {
        quote = null;
        if (quotedRoot && depth === 0) return { text: value.slice(start, index + 1), consumed: index + 1 };
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (character === "[" || character === "{" || character === "(") {
      depth += 1;
      sawBracket = true;
    } else if (character === "]" || character === "}" || character === ")") {
      depth -= 1;
      if (sawBracket && depth === 0) return { text: value.slice(start, index + 1), consumed: index + 1 };
    } else if ((character === "," || character === "\n") && depth === 0) {
      return { text: value.slice(start, index), consumed: index + 1 };
    }
  }
  return { text: value.slice(start), consumed: value.length };
};

const hasSetupPyPytest = (content: string): boolean => {
  const uncommented = content.split(/\r?\n/).map(stripConfigComment).join("\n");
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  for (let index = 0; index < uncommented.length; index += 1) {
    const character = uncommented[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    const previous = uncommented[index - 1];
    if (previous && /[A-Za-z0-9_]/.test(previous)) continue;
    const assignment = uncommented.slice(index).match(/^(?:install_requires|tests_require|extras_require)\s*=\s*/);
    if (!assignment) continue;
    const expressionStart = index + assignment[0].length;
    const expression = firstPythonExpression(uncommented.slice(expressionStart));
    if (containsPytestRequirement(expression.text)) return true;
    index = expressionStart + expression.consumed - 1;
  }
  return false;
};

const hasSetupDependencyPytest = (base: string, content: string): boolean =>
  /^requirements.*\.txt$/i.test(base)
    ? hasRequirementsPytest(content)
    : base === "setup.cfg"
      ? hasSetupCfgPytest(content)
      : base === "setup.py" && hasSetupPyPytest(content);

async function pythonCommandEvidence(repository: Repository): Promise<Map<string, PythonCommandEvidence>> {
  const evidence = new Map<string, PythonCommandEvidence>();
  const add = (directory: string): PythonCommandEvidence => {
    const current = evidence.get(directory) ?? emptyPythonEvidence();
    evidence.set(directory, current);
    return current;
  };

  for (const filePath of repository.configFiles) {
    let content: string;
    try {
      content = await fs.readFile(path.join(repository.snapshot.root, filePath), "utf8");
    } catch {
      continue;
    }
    const base = path.posix.basename(filePath).toLowerCase();
    const current = add(configDirectory(filePath));
    if (base === "pytest.ini" || (base === "pyproject.toml" && hasSection(content, "tool.pytest"))) {
      current.pytest = true;
    }
    if (hasSetupDependencyPytest(base, content)) {
      current.pytest = true;
    }
    if (base === "ruff.toml" || base === ".ruff.toml"
      || (base === "pyproject.toml" && hasSection(content, "tool.ruff"))) {
      current.ruff = true;
    }
    if (base === "mypy.ini" || base === ".mypy.ini"
      || (base === "pyproject.toml" && hasSection(content, "tool.mypy"))) {
      current.mypy = true;
    }
    if (base === "pyproject.toml" && hasSection(content, "build-system")) current.build = true;
  }
  return evidence;
}

async function suggestedCommands(repository: Repository): Promise<SuggestedCommand[]> {
  const commands: SuggestedCommand[] = [];
  const seen = new Set<string>();
  const add = (command: SuggestedCommand): void => {
    const key = `${command.directory}\0${command.command}`;
    if (seen.has(key) || commands.length >= 5) return;
    seen.add(key);
    commands.push(command);
  };
  const priorities = ["test", "typecheck", "lint", "check", "build"];
  for (const packageInfo of repository.packages) {
    for (const name of priorities) {
      if (!packageInfo.scripts[name]) continue;
      add({
        name,
        command: `${name === "test" ? "npm test" : `npm run ${name}`}`,
        directory: packageInfo.directory,
        reason: `Existing ${name} script in ${packageInfo.name ?? "package"}`,
      });
      if (commands.length >= 5) return commands;
    }
  }

  const pythonEvidence = await pythonCommandEvidence(repository);
  const hasPytestEvidence = [...pythonEvidence.values()].some((item) => item.pytest);
  if (!hasPytestEvidence && repository.sourceFiles.some((filePath) =>
    /\.py$/i.test(filePath)
    && (/(?:^|\/)(?:tests?|spec)(?:\/|$)/i.test(filePath)
      || /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(filePath)))) {
    add({
      name: "test",
      command: "python -m unittest discover",
      directory: ".",
      reason: "Python test files detected",
    });
  }
  for (const [directory, item] of [...pythonEvidence.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (item.pytest) add({ name: "test", command: "python -m pytest", directory, reason: "Pytest configuration detected" });
    if (item.ruff) add({ name: "lint", command: "python -m ruff check .", directory, reason: "Ruff configuration detected" });
    if (item.mypy) add({ name: "typecheck", command: "python -m mypy .", directory, reason: "mypy configuration detected" });
    if (item.build) add({ name: "build", command: "python -m build", directory, reason: "Python build system detected" });
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
  const commands = await suggestedCommands(repository);
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
