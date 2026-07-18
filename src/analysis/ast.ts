import { javascriptTypeScriptAdapter } from "../languages/javascript-typescript.js";
import type { DiscoveredRepository, FileAnalysis } from "../types.js";

export async function analyzeFiles(repository: DiscoveredRepository): Promise<FileAnalysis[]> {
  return javascriptTypeScriptAdapter.analyzeFiles(repository, repository.sourceFiles);
}

export function enrichSemanticReferences(
  repository: DiscoveredRepository,
  analyses: FileAnalysis[],
  focusPaths: string[],
): boolean {
  return javascriptTypeScriptAdapter.enrichSemanticReferences!(repository, analyses, focusPaths);
}
