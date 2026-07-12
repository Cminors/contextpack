import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { DiscoveredRepository, FileAnalysis, SymbolKind, SymbolRecord } from "../types.js";
import { toPosixPath } from "../utils/path.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

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

function resolveImport(fromPath: string, specifier: string, knownFiles: Set<string>): string | null {
  const fromDirectory = path.posix.dirname(fromPath);
  const bases: string[] = [];

  if (specifier.startsWith(".")) {
    bases.push(path.posix.normalize(path.posix.join(fromDirectory, specifier)));
  } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    const rest = specifier.slice(2);
    bases.push(`src/${rest}`, rest);
  } else {
    return null;
  }

  for (const base of bases) {
    const candidates = [base];
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
  const analyses: FileAnalysis[] = [];

  for (const relativePath of repository.sourceFiles) {
    const absolutePath = path.join(repository.snapshot.root, relativePath);
    const content = await fs.readFile(absolutePath, "utf8");
    const source = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true, scriptKind(relativePath));
    const imports = importSpecifiers(source)
      .map((specifier) => resolveImport(relativePath, specifier, knownFiles))
      .filter((value): value is string => value !== null);

    analyses.push({
      path: relativePath,
      absolutePath,
      language: /\.[cm]?tsx?$/.test(relativePath) ? "typescript" : "javascript",
      content,
      lineCount: content.split(/\r?\n/).length,
      imports: [...new Set(imports)].sort(),
      importedBy: [],
      symbols: topLevelSymbols(source),
      isTest: testPath(relativePath),
      isConfig: false,
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
  }
  for (const analysis of analyses) {
    analysis.importedBy.sort();
  }

  return analyses.sort((left, right) => left.path.localeCompare(right.path));
}
