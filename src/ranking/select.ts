import type { ContextCandidate, ContextSelection, FileAnalysis } from "../types.js";
import { containsLikelySecret } from "../utils/security.js";
import { countTokens } from "../output/tokens.js";

export const MAX_SELECTED_SNIPPETS = 16;

function snippetFor(file: FileAnalysis, candidate: ContextCandidate): ContextSelection | null {
  const lines = file.content.split(/\r?\n/);
  const padding = candidate.symbol ? 2 : 0;
  const startLine = Math.max(1, candidate.startLine - padding);
  const endLine = Math.min(lines.length, candidate.endLine + padding, startLine + 119);
  const snippet = lines.slice(startLine - 1, endLine).join("\n");
  if (!snippet.trim() || containsLikelySecret(snippet)) return null;
  const estimatedTokens = countTokens(snippet);
  return { ...candidate, startLine, endLine, snippet, estimatedTokens, selected: true };
}

export function selectCandidates(candidates: ContextCandidate[], files: FileAnalysis[], budget: number, mapReserve = 3200): ContextSelection[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const available = Math.max(800, budget - Math.min(mapReserve, Math.floor(budget * 0.42)));
  let used = 0;
  const selected: ContextSelection[] = [];
  for (const candidate of candidates) {
    if (candidate.score <= 0) continue;
    const file = byPath.get(candidate.path);
    if (!file) continue;
    const selection = snippetFor(file, candidate);
    if (!selection) continue;
    candidate.estimatedTokens = selection.estimatedTokens;
    if (used + selection.estimatedTokens > available && selected.length > 0) continue;
    candidate.selected = true;
    selected.push(selection);
    used += selection.estimatedTokens;
    if (selected.length >= MAX_SELECTED_SNIPPETS || used >= available) break;
  }
  return selected;
}
