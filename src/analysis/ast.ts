import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { DiscoveredRepository, FileAnalysis, SymbolKind, SymbolRecord } from "../types.js";
import { toPosixPath } from "../utils/path.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

interface ProgramIndex {
  references: Map<string, string[]>;
  referenceSymbols: Map<string, Record<string, string[]>>;
}

function canonicalPath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function typescriptExtension(fileName: string): ts.Extension {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".tsx") return ts.Extension.Tsx;
  if (extension === ".jsx") return ts.Extension.Jsx;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.Extension.Js;
  if (extension === ".mts") return ts.Extension.Mts;
  if (extension === ".cts") return ts.Extension.Cts;
  return ts.Extension.Ts;
}

function rootTypeScriptConfig(root: string): string | null {
  const configPath = path.join(root, "tsconfig.json");
  return ts.sys.fileExists(configPath) ? configPath : null;
}

function compilerOptionsFor(root: string): ts.CompilerOptions {
  const defaults: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
    types: [],
  };
  const configPath = rootTypeScriptConfig(root);
  if (!configPath) return defaults;
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return defaults;
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), undefined, configPath);
  return {
    ...defaults,
    ...parsed.options,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    types: [],
  };
}

function createProgramIndex(repository: DiscoveredRepository, focusPaths: string[]): ProgramIndex {
  const root = repository.snapshot.root;
  const knownFiles = new Set(repository.sourceFiles);
  const byAbsolutePath = new Map(
    repository.sourceFiles.map((relativePath) => [canonicalPath(path.resolve(root, relativePath)), relativePath]),
  );
  const relativePathFor = (fileName: string): string | null => {
    const absoluteMatch = byAbsolutePath.get(canonicalPath(fileName));
    if (absoluteMatch) return absoluteMatch;
    const relative = toPosixPath(path.relative(root, fileName));
    return knownFiles.has(relative) ? relative : null;
  };
  const compilerOptions = compilerOptionsFor(root);
  const moduleResolutionCache = ts.createModuleResolutionCache(root, canonicalPath, compilerOptions);
  const compilerHost = ts.createCompilerHost(compilerOptions);
  compilerHost.resolveModuleNames = (moduleNames, containingFile) => {
    const containingPath = relativePathFor(containingFile);
    return moduleNames.map((specifier) => {
      const resolved = ts.resolveModuleName(
        specifier,
        containingFile,
        compilerOptions,
        ts.sys,
        moduleResolutionCache,
      ).resolvedModule;
      if (resolved && relativePathFor(resolved.resolvedFileName)) return resolved;
      if (!containingPath) return undefined;
      const fallback = resolveImport(containingPath, specifier, knownFiles, repository);
      if (!fallback) return undefined;
      const resolvedFileName = path.resolve(root, fallback);
      return {
        resolvedFileName,
        extension: typescriptExtension(resolvedFileName),
        isExternalLibraryImport: false,
      };
    });
  };
  const program = ts.createProgram({
    rootNames: focusPaths.map((relativePath) => path.resolve(root, relativePath)),
    options: compilerOptions,
    host: compilerHost,
  });
  const checker = program.getTypeChecker();
  const references = new Map<string, string[]>();
  const referenceSymbols = new Map<string, Record<string, string[]>>();
  const targetCache = new Map<ts.Symbol, { name: string; paths: string[] }>();
  const focus = new Set(focusPaths);

  const targetsFor = (input: ts.Symbol): { name: string; paths: string[] } => {
    const cached = targetCache.get(input);
    if (cached) return cached;
    let resolved = input;
    if ((resolved.flags & ts.SymbolFlags.Alias) !== 0) {
      try {
        resolved = checker.getAliasedSymbol(resolved);
      } catch {
        // A broken or incomplete project can expose an alias without a resolvable target.
      }
    }
    const paths = [
      ...new Set(
        (resolved.getDeclarations() ?? [])
          .map((declaration) => relativePathFor(declaration.getSourceFile().fileName))
          .filter((value): value is string => value !== null),
      ),
    ].sort();
    const target = { name: resolved.getName(), paths };
    targetCache.set(input, target);
    return target;
  };

  for (const source of program.getSourceFiles()) {
    const sourcePath = relativePathFor(source.fileName);
    if (!sourcePath || !focus.has(sourcePath)) continue;
    const targets = new Set<string>();
    const namesByTarget = new Map<string, Set<string>>();
    const addIdentifier = (node: ts.Identifier | undefined): void => {
      if (!node) return;
      const resolved = checker.getSymbolAtLocation(node);
      if (!resolved) return;
      const targetSymbol = targetsFor(resolved);
      for (const target of targetSymbol.paths) {
        if (target !== sourcePath) targets.add(target);
        if (target !== sourcePath) {
          const names = namesByTarget.get(target) ?? new Set<string>();
          names.add(targetSymbol.name === "default" ? node.text : targetSymbol.name);
          namesByTarget.set(target, names);
        }
      }
    };
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        addIdentifier(statement.importClause.name);
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) addIdentifier(bindings.name);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) addIdentifier(element.name);
        }
      } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (ts.isIdentifier(element.name)) addIdentifier(element.name);
        }
      }
    }
    references.set(sourcePath, [...targets].sort());
    referenceSymbols.set(
      sourcePath,
      Object.fromEntries(
        [...namesByTarget]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([target, names]) => [target, [...names].sort()]),
      ),
    );
  }

  return { references, referenceSymbols };
}

function scriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function lineRange(source: ts.SourceFile, node: ts.Node): { startLine: number; endLine: number } {
  const startLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const endLine = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { startLine, endLine };
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) =>
        [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(modifier.kind),
      ) ?? false)
    : false;
}

function symbol(source: ts.SourceFile, node: ts.Node, name: string, kind: SymbolKind, exported: boolean): SymbolRecord {
  const range = lineRange(source, node);
  return {
    name,
    kind,
    startLine: range.startLine,
    endLine: range.endLine,
    exported,
    text: node.getText(source),
  };
}

function topLevelSymbols(source: ts.SourceFile): SymbolRecord[] {
  const records: SymbolRecord[] = [];

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      records.push(symbol(source, statement, statement.name?.text ?? "default", "function", hasExportModifier(statement)));
    } else if (ts.isClassDeclaration(statement)) {
      const className = statement.name?.text ?? "default";
      records.push(symbol(source, statement, className, "class", hasExportModifier(statement)));
      for (const member of statement.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          records.push(
            symbol(source, member, `${className}.${member.name.getText(source)}`, "method", hasExportModifier(statement)),
          );
        }
      }
    } else if (ts.isInterfaceDeclaration(statement)) {
      records.push(symbol(source, statement, statement.name.text, "interface", hasExportModifier(statement)));
    } else if (ts.isTypeAliasDeclaration(statement)) {
      records.push(symbol(source, statement, statement.name.text, "type", hasExportModifier(statement)));
    } else if (ts.isEnumDeclaration(statement)) {
      records.push(symbol(source, statement, statement.name.text, "enum", hasExportModifier(statement)));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        records.push(
          symbol(source, statement, declaration.name.getText(source), "variable", hasExportModifier(statement)),
        );
      }
    }
  }

  if (records.length === 0 && source.statements.length > 0) {
    records.push(symbol(source, source, path.basename(source.fileName), "module", false));
  }
  return records;
}

function importSpecifiers(source: ts.SourceFile): string[] {
  const imports = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require") {
          imports.add(argument.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...imports];
}

function testPath(filePath: string): boolean {
  return (
    /(?:^|\/)(__tests__|tests?|spec)(?:\/|$)/i.test(filePath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(filePath)
  );
}

function packageDirectoryFor(filePath: string, repository: DiscoveredRepository): string | null {
  const matches = repository.packages
    .map((item) => item.directory)
    .filter((directory) => directory === "." || filePath === directory || filePath.startsWith(`${directory}/`))
    .sort((left, right) => right.length - left.length);
  return matches[0] ?? null;
}

function resolveImport(
  fromPath: string,
  specifier: string,
  knownFiles: Set<string>,
  repository: DiscoveredRepository,
): string | null {
  const fromDirectory = path.posix.dirname(fromPath);
  const bases: string[] = [];

  if (specifier.startsWith(".")) {
    bases.push(path.posix.normalize(path.posix.join(fromDirectory, specifier)));
  } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    const rest = specifier.slice(2);
    bases.push(`src/${rest}`, rest);
  } else {
    const workspacePackage = repository.packages
      .filter((item) => item.name)
      .sort((left, right) => (right.name?.length ?? 0) - (left.name?.length ?? 0))
      .find((item) => specifier === item.name || specifier.startsWith(`${item.name}/`));
    if (!workspacePackage?.name) return null;
    const subpath = specifier === workspacePackage.name ? "" : specifier.slice(workspacePackage.name.length + 1);
    const directory = workspacePackage.directory === "." ? "" : workspacePackage.directory;
    if (subpath) {
      bases.push(path.posix.join(directory, "src", subpath), path.posix.join(directory, subpath));
    } else {
      bases.push(path.posix.join(directory, "src", "index"), path.posix.join(directory, "index"));
    }
  }

  for (const base of bases) {
    const candidates = [base];
    if (/\.[cm]?jsx?$/.test(base)) {
      const withoutRuntimeExtension = base.replace(/\.[cm]?jsx?$/, "");
      candidates.push(withoutRuntimeExtension);
      for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
        candidates.push(`${withoutRuntimeExtension}${extension}`, `${withoutRuntimeExtension}/index${extension}`);
      }
    }
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${extension}`, `${base}/index${extension}`);
    }
    const match = candidates.find((candidate) => knownFiles.has(toPosixPath(candidate)));
    if (match) return toPosixPath(match);
  }
  return null;
}

export async function analyzeFiles(repository: DiscoveredRepository): Promise<FileAnalysis[]> {
  const knownFiles = new Set(repository.sourceFiles);
  const root = repository.snapshot.root;
  const hasTypeScriptConfig = Boolean(rootTypeScriptConfig(repository.snapshot.root));
  const compilerOptions = hasTypeScriptConfig ? compilerOptionsFor(root) : {};
  const moduleResolutionCache = ts.createModuleResolutionCache(root, canonicalPath, compilerOptions);
  const byAbsolutePath = new Map(
    repository.sourceFiles.map((relativePath) => [canonicalPath(path.resolve(root, relativePath)), relativePath]),
  );
  const relativePathFor = (fileName: string): string | null => {
    const absoluteMatch = byAbsolutePath.get(canonicalPath(fileName));
    if (absoluteMatch) return absoluteMatch;
    const relative = toPosixPath(path.relative(root, fileName));
    return knownFiles.has(relative) ? relative : null;
  };
  const analyses: FileAnalysis[] = [];

  for (const relativePath of repository.sourceFiles) {
    const absolutePath = path.join(repository.snapshot.root, relativePath);
    const content = await fs.readFile(absolutePath, "utf8");
    const source = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true, scriptKind(relativePath));
    const imports = importSpecifiers(source)
      .map((specifier) => {
        const resolved = hasTypeScriptConfig
          ? ts.resolveModuleName(
              specifier,
              absolutePath,
              compilerOptions,
              ts.sys,
              moduleResolutionCache,
            ).resolvedModule
          : undefined;
        const resolvedPath = resolved ? relativePathFor(resolved.resolvedFileName) : null;
        return resolvedPath ?? resolveImport(relativePath, specifier, knownFiles, repository);
      })
      .filter((value): value is string => value !== null);

    analyses.push({
      path: relativePath,
      absolutePath,
      language: /\.[cm]?tsx?$/.test(relativePath) ? "typescript" : "javascript",
      content,
      lineCount: content.split(/\r?\n/).length,
      imports: [...new Set(imports)].sort(),
      importedBy: [],
      references: [],
      referencedBy: [],
      referenceSymbols: {},
      symbols: topLevelSymbols(source),
      isTest: testPath(relativePath),
      isConfig: /(?:^|\/)[^/]*config\.[cm]?[jt]sx?$/i.test(relativePath),
      packageDirectory: packageDirectoryFor(relativePath, repository),
    });
  }

  for (const configPath of repository.configFiles) {
    if (knownFiles.has(configPath)) continue;
    const absolutePath = path.join(repository.snapshot.root, configPath);
    const content = await fs.readFile(absolutePath, "utf8");
    analyses.push({
      path: configPath,
      absolutePath,
      language: "json",
      content,
      lineCount: content.split(/\r?\n/).length,
      imports: [],
      importedBy: [],
      references: [],
      referencedBy: [],
      referenceSymbols: {},
      symbols: [],
      isTest: false,
      isConfig: true,
      packageDirectory: packageDirectoryFor(configPath, repository),
    });
  }

  const byPath = new Map(analyses.map((analysis) => [analysis.path, analysis]));
  for (const analysis of analyses) {
    for (const importedPath of analysis.imports) {
      const imported = byPath.get(importedPath);
      if (imported && !imported.importedBy.includes(analysis.path)) {
        imported.importedBy.push(analysis.path);
      }
    }
    for (const referencedPath of analysis.references) {
      const referenced = byPath.get(referencedPath);
      if (referenced && !referenced.referencedBy.includes(analysis.path)) {
        referenced.referencedBy.push(analysis.path);
      }
    }
  }
  for (const analysis of analyses) {
    analysis.importedBy.sort();
    analysis.referencedBy.sort();
  }

  return analyses.sort((left, right) => left.path.localeCompare(right.path));
}

export function enrichSemanticReferences(
  repository: DiscoveredRepository,
  analyses: FileAnalysis[],
  focusPaths: string[],
): boolean {
  if (!rootTypeScriptConfig(repository.snapshot.root)) return false;
  const sourcePaths = new Set(repository.sourceFiles);
  const focus = [...new Set(focusPaths)].filter((filePath) => sourcePaths.has(filePath));
  if (focus.length === 0) return false;
  const programIndex = createProgramIndex(repository, focus);
  const byPath = new Map(analyses.map((analysis) => [analysis.path, analysis]));
  for (const filePath of focus) {
    const analysis = byPath.get(filePath);
    if (!analysis) continue;
    analysis.references = programIndex.references.get(filePath) ?? [];
    analysis.referenceSymbols = programIndex.referenceSymbols.get(filePath) ?? {};
    for (const targetPath of analysis.references) {
      const target = byPath.get(targetPath);
      if (target && !target.referencedBy.includes(filePath)) target.referencedBy.push(filePath);
    }
  }
  for (const analysis of analyses) analysis.referencedBy.sort();
  return true;
}
