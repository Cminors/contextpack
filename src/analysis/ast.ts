import { defaultLanguageAdapterRegistry } from "../languages/defaults.js";
import type { LanguageAdapterRegistry } from "../languages/types.js";
import type { DiscoveredRepository, FileAnalysis } from "../types.js";

export async function analyzeFiles(
  repository: DiscoveredRepository,
  registry: LanguageAdapterRegistry = defaultLanguageAdapterRegistry,
): Promise<FileAnalysis[]> {
  const sourceFilesByAdapter = new Map(registry.adapters.map((adapter) => [adapter, [] as string[]]));
  for (const sourceFile of repository.sourceFiles) {
    const owner = registry.ownerFor(sourceFile);
    sourceFilesByAdapter.get(owner)!.push(sourceFile);
  }

  const analyses: FileAnalysis[] = [];
  for (const adapter of registry.adapters) {
    const sourceFiles = sourceFilesByAdapter.get(adapter)!;
    if (sourceFiles.length === 0) continue;
    analyses.push(...await adapter.analyzeFiles(repository, sourceFiles));
  }
  return analyses.sort((left, right) => left.path.localeCompare(right.path));
}

export function enrichSemanticReferences(
  repository: DiscoveredRepository,
  analyses: FileAnalysis[],
  focusPaths: string[],
  registry: LanguageAdapterRegistry = defaultLanguageAdapterRegistry,
): boolean {
  const sourcePaths = new Set(repository.sourceFiles);
  const focusPathsByAdapter = new Map(registry.adapters.map((adapter) => [adapter, [] as string[]]));
  for (const focusPath of focusPaths) {
    if (!sourcePaths.has(focusPath)) continue;
    const owner = registry.ownerFor(focusPath);
    focusPathsByAdapter.get(owner)!.push(focusPath);
  }

  let enriched = false;
  for (const adapter of registry.adapters) {
    const enrich = adapter.enrichSemanticReferences;
    const adapterFocusPaths = focusPathsByAdapter.get(adapter)!;
    if (!enrich || adapterFocusPaths.length === 0) continue;
    enriched = enrich(repository, analyses, adapterFocusPaths) || enriched;
  }
  return enriched;
}
