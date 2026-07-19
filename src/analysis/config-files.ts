import fs from "node:fs/promises";
import path from "node:path";
import type { DiscoveredRepository, FileAnalysis } from "../types.js";

export function packageDirectoryFor(filePath: string, repository: DiscoveredRepository): string | null {
  const pythonPackageDirectories = repository.configFiles
    .filter((configPath) => /(?:^|\/)(?:pyproject\.toml|setup\.py|setup\.cfg)$/i.test(configPath))
    .map((configPath) => path.posix.dirname(configPath));
  const matches = [...repository.packages.map((item) => item.directory), ...pythonPackageDirectories]
    .filter((directory, index, all) => all.indexOf(directory) === index)
    .filter((directory) => directory === "." || filePath === directory || filePath.startsWith(`${directory}/`))
    .sort((left, right) => right.length - left.length);
  return matches[0] ?? null;
}

export async function analyzeConfigFiles(repository: DiscoveredRepository): Promise<FileAnalysis[]> {
  const sourcePaths = new Set(repository.sourceFiles);
  const analyses: FileAnalysis[] = [];
  for (const configPath of repository.configFiles) {
    if (sourcePaths.has(configPath)) continue;
    const absolutePath = path.join(repository.snapshot.root, configPath);
    const content = await fs.readFile(absolutePath, "utf8");
    const extension = path.extname(configPath).toLowerCase();
    const language = extension === ".json" ? "json" : extension === ".py" ? "python" : "text";
    analyses.push({
      path: configPath,
      absolutePath,
      language,
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
  return analyses;
}
