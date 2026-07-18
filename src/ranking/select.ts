import type { ContextCandidate, ContextSelection, FileAnalysis } from "../types.js";
import { containsLikelySecret } from "../utils/security.js";
import { countTokens } from "../output/tokens.js";

export const MAX_SELECTED_SNIPPETS = 16;
const PRIMARY_DIVERSITY_FLOOR = 10;
const MAX_GLOBAL_ALTERNATES = 2;

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
  const selectedPrimaries: Array<{ candidate: ContextCandidate; file: FileAnalysis }> = [];
  const selectPrimary = (candidate: ContextCandidate): boolean => {
    if (candidate.score <= 0) return false;
    const file = byPath.get(candidate.path);
    if (!file) return false;
    const selection = snippetFor(file, candidate);
    if (!selection) return false;
    candidate.estimatedTokens = selection.estimatedTokens;
    if (used + selection.estimatedTokens > available && selected.length > 0) return false;
    candidate.selected = true;
    selected.push(selection);
    selectedPrimaries.push({ candidate, file });
    used += selection.estimatedTokens;
    return true;
  };

  let nextCandidate = 0;
  while (
    nextCandidate < candidates.length
    && selectedPrimaries.length < PRIMARY_DIVERSITY_FLOOR
    && selected.length < MAX_SELECTED_SNIPPETS
    && used < available
  ) {
    const candidate = candidates[nextCandidate];
    nextCandidate += 1;
    if (candidate) selectPrimary(candidate);
  }

  let alternatesEmitted = 0;
  for (const { candidate, file } of selectedPrimaries) {
    if (alternatesEmitted >= MAX_GLOBAL_ALTERNATES || selected.length >= MAX_SELECTED_SNIPPETS || used >= available) break;
    for (const alternate of candidate.alternateRegions ?? []) {
      if (alternatesEmitted >= MAX_GLOBAL_ALTERNATES || selected.length >= MAX_SELECTED_SNIPPETS || used >= available) break;
      const { alternateRegions: _alternateRegions, ...candidateWithoutAlternates } = candidate;
      const alternateSelection = snippetFor(file, {
        ...candidateWithoutAlternates,
        symbol: alternate.symbol,
        startLine: alternate.startLine,
        endLine: alternate.endLine,
        estimatedTokens: 0,
      });
      if (!alternateSelection || used + alternateSelection.estimatedTokens > available) continue;
      selected.push(alternateSelection);
      used += alternateSelection.estimatedTokens;
      alternatesEmitted += 1;
    }
  }

  while (nextCandidate < candidates.length && selected.length < MAX_SELECTED_SNIPPETS && used < available) {
    const candidate = candidates[nextCandidate];
    nextCandidate += 1;
    if (candidate) selectPrimary(candidate);
  }
  return selected;
}
