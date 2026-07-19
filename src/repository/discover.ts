import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { ContextPackError } from "../errors.js";
import { defaultLanguageAdapterRegistry } from "../languages/defaults.js";
import type { LanguageAdapterRegistry } from "../languages/types.js";
import type { ContextWarning, DiscoveredRepository, RepositorySnapshot } from "../types.js";
import { findGitRoot, runGit } from "../utils/git.js";
import { toPosixPath } from "../utils/path.js";
import { isSensitivePath } from "../utils/security.js";
import { detectPackageManager, detectProjectTypes, discoverPackages } from "./packages.js";
import { discoverRules } from "./rules.js";
const ALWAYS_IGNORED = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/.contextpack/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/.tox/**",
  "**/.nox/**",
  "**/site-packages/**",
  "**/*.egg-info/**",
  "**/eggs/**",
];

async function loadGitIgnore(root: string): Promise<ReturnType<typeof ignore>> {
  const matcher = ignore();
  try {
    matcher.add(await fs.readFile(path.join(root, ".gitignore"), "utf8"));
  } catch {
    // Repositories do not need a .gitignore to be analyzed.
  }
  return matcher;
}

async function rootFileNames(root: string): Promise<Set<string>> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
}

function snapshotFor(root: string, packageManager: RepositorySnapshot["packageManager"], projectType: string[]): RepositorySnapshot {
  const gitRoot = findGitRoot(root);
  const isGitRepository = gitRoot !== null;
  const commit = isGitRepository ? runGit(root, ["rev-parse", "HEAD"]).stdout || "unavailable" : "unavailable";
  const branchResult = isGitRepository ? runGit(root, ["branch", "--show-current"]) : null;
  const shallowResult = isGitRepository ? runGit(root, ["rev-parse", "--is-shallow-repository"]) : null;

  return {
    root,
    commit,
    branch: branchResult?.stdout || null,
    packageManager,
    projectType,
    isGitRepository,
    isShallow: shallowResult?.stdout === "true",
  };
}

export async function discoverRepository(
  start: string,
  registry: LanguageAdapterRegistry = defaultLanguageAdapterRegistry,
): Promise<DiscoveredRepository> {
  const requestedRoot = path.resolve(start);
  const gitRoot = findGitRoot(requestedRoot);
  const root = path.resolve(gitRoot ?? requestedRoot);
  const warnings: ContextWarning[] = [];

  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      throw new ContextPackError(`Repository root is not a directory: ${root}`, 1, "INVALID_ROOT");
    }
  } catch (error) {
    if (error instanceof ContextPackError) throw error;
    throw new ContextPackError(`Cannot read repository root: ${root}`, 1, "INVALID_ROOT");
  }

  const gitIgnore = await loadGitIgnore(root);
  const [sourceMatches, configMatches, fileNames, packages, rules] = await Promise.all([
    fg([...registry.sourcePatterns], { cwd: root, onlyFiles: true, unique: true, ignore: ALWAYS_IGNORED }),
    fg([...registry.configPatterns], { cwd: root, onlyFiles: true, unique: true, ignore: ALWAYS_IGNORED }),
    rootFileNames(root),
    discoverPackages(root),
    discoverRules(root),
  ]);

  const filterPath = (value: string): boolean => {
    const normalized = toPosixPath(value);
    return !gitIgnore.ignores(normalized) && !isSensitivePath(normalized);
  };
  const sourceFiles = sourceMatches.filter(filterPath).map(toPosixPath).sort();
  const configFiles = configMatches.filter(filterPath).map(toPosixPath).sort();

  for (const sourceFile of sourceFiles) registry.ownerFor(sourceFile);

  if (sourceFiles.length === 0) {
    throw new ContextPackError(
      "No supported source files were found.",
      2,
      "UNSUPPORTED_REPOSITORY",
    );
  }

  if (!gitRoot) {
    warnings.push({ code: "NO_GIT_REPOSITORY", message: "Git history is unavailable; using static analysis only." });
  }

  const packageManager = detectPackageManager(root, fileNames);
  const projectType = await detectProjectTypes(root, packages, sourceFiles, configFiles);
  const snapshot = snapshotFor(root, packageManager, projectType);
  if (snapshot.isShallow) {
    warnings.push({ code: "SHALLOW_CLONE", message: "Git co-change analysis is limited by the shallow clone." });
  }

  return {
    snapshot,
    sourceFiles,
    configFiles,
    packages,
    rules,
    warnings,
  };
}
