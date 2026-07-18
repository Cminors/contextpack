import type { DiscoveredRepository, FileAnalysis } from "../types.js";

export interface LanguageAdapter {
  readonly id: string;
  readonly sourcePatterns: readonly string[];
  readonly configPatterns: readonly string[];
  owns(filePath: string): boolean;
  analyzeFiles(
    repository: DiscoveredRepository,
    sourceFiles: readonly string[],
  ): Promise<FileAnalysis[]>;
  enrichSemanticReferences?(
    repository: DiscoveredRepository,
    files: FileAnalysis[],
    focusPaths: readonly string[],
  ): boolean;
}

export interface LanguageAdapterRegistry {
  readonly adapters: readonly LanguageAdapter[];
  readonly sourcePatterns: readonly string[];
  readonly configPatterns: readonly string[];
  ownerFor(filePath: string): LanguageAdapter;
}
