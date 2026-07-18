import type { FileAnalysis, SymbolRecord } from "../types.js";
import type { ContentEvidence } from "./lexical.js";

export const REGION_LIMITS = {
  clusterRadius: 20,
  contextPadding: 6,
  maxLines: 32,
} as const;

const FIELD_WEIGHTS: Record<ContentEvidence["field"], number> = {
  comment: 1.1,
  identifier: 0.7,
  string: 0.9,
  "test-title": 1.25,
};

const LOCALIZATION_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "before", "being", "but", "by", "can",
  "did", "do", "does", "for", "from", "get", "had", "has", "have", "how", "if", "in", "into",
  "is", "it", "may", "not", "of", "on", "or", "our", "please", "same", "should", "than", "that",
  "the", "their", "there", "they", "this", "to", "was", "we", "were", "when", "where", "which",
  "will", "with", "you", "your",
]);

export interface LocatedRegion {
  symbol: SymbolRecord | null;
  startLine: number;
  endLine: number;
}

export interface LocatedRegionCandidate extends LocatedRegion {
  evidence: ContentEvidence[];
  distinctTerms: number;
}

function evidenceKey(item: ContentEvidence): string {
  return `${item.term}\0${item.field}\0${item.line}`;
}

function uniqueEvidence(evidence: ContentEvidence[]): ContentEvidence[] {
  const seen = new Set<string>();
  return evidence
    .filter((item) => Number.isInteger(item.line) && item.line > 0 && !LOCALIZATION_STOP_WORDS.has(item.term))
    .filter((item) => {
      const key = evidenceKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function bestCluster(evidence: ContentEvidence[]): ContentEvidence[] {
  const normalized = uniqueEvidence(evidence);
  const peakEvidenceRelevance = Math.max(0, ...normalized.map((item) => item.relevance ?? 0));
  const anchors = peakEvidenceRelevance > 0
    ? normalized.filter((item) => (item.relevance ?? 0) >= peakEvidenceRelevance)
    : normalized;
  const clusterScore = (items: ContentEvidence[]): number => {
    const bestFieldByTerm = new Map<string, number>();
    const relevanceByTerm = new Map<string, number>();
    for (const item of items) {
      bestFieldByTerm.set(item.term, Math.max(bestFieldByTerm.get(item.term) ?? 0, FIELD_WEIGHTS[item.field]));
      relevanceByTerm.set(item.term, Math.max(relevanceByTerm.get(item.term) ?? 0, item.relevance ?? 0));
    }
    const lines = items.map((item) => item.line);
    const span = Math.max(...lines) - Math.min(...lines);
    const distinctTerms = bestFieldByTerm.size;
    const fieldQuality = [...bestFieldByTerm.values()].reduce((sum, value) => sum + value, 0);
    const retrievalQuality = [...relevanceByTerm.values()].reduce((sum, value) => sum + value, 0);
    const peakRetrievalQuality = Math.max(0, ...relevanceByTerm.values());
    return (distinctTerms + fieldQuality + retrievalQuality * 2 + peakRetrievalQuality * 4)
      / (1 + span / REGION_LIMITS.clusterRadius);
  };
  return anchors
    .map((anchor) => normalized.filter((item) => Math.abs(item.line - anchor.line) <= REGION_LIMITS.clusterRadius))
    .sort((left, right) => {
      const scoreDelta = clusterScore(right) - clusterScore(left);
      if (scoreDelta !== 0) return scoreDelta;
      const leftTerms = new Set(left.map((item) => item.term)).size;
      const rightTerms = new Set(right.map((item) => item.term)).size;
      const termDelta = rightTerms - leftTerms;
      if (termDelta !== 0) return termDelta;
      const spanDelta = (Math.max(...left.map((item) => item.line)) - Math.min(...left.map((item) => item.line)))
        - (Math.max(...right.map((item) => item.line)) - Math.min(...right.map((item) => item.line)));
      return spanDelta || Math.min(...left.map((item) => item.line)) - Math.min(...right.map((item) => item.line));
    })[0] ?? [];
}

function smallestContainingSymbol(file: FileAnalysis, lines: number[]): SymbolRecord | null {
  if (lines.length === 0) return null;
  return file.symbols
    .filter((symbol) => lines.every((line) => symbol.startLine <= line && symbol.endLine >= line))
    .sort((left, right) =>
      (left.endLine - left.startLine) - (right.endLine - right.startLine)
      || left.startLine - right.startLine
      || left.name.localeCompare(right.name),
    )[0] ?? null;
}

function boundedWindow(
  firstLine: number,
  lastLine: number,
  minimum: number,
  maximum: number,
): { startLine: number; endLine: number } {
  const desiredStart = Math.max(minimum, firstLine - REGION_LIMITS.contextPadding);
  const desiredEnd = Math.min(maximum, lastLine + REGION_LIMITS.contextPadding);
  if (desiredEnd - desiredStart + 1 <= REGION_LIMITS.maxLines) {
    return { startLine: desiredStart, endLine: desiredEnd };
  }
  const center = Math.round((firstLine + lastLine) / 2);
  let startLine = Math.max(minimum, center - Math.floor(REGION_LIMITS.maxLines / 2));
  let endLine = Math.min(maximum, startLine + REGION_LIMITS.maxLines - 1);
  startLine = Math.max(minimum, endLine - REGION_LIMITS.maxLines + 1);
  return { startLine, endLine };
}

function locateCluster(file: FileAnalysis, cluster: ContentEvidence[]): LocatedRegion {
  const lines = cluster.map((item) => item.line).sort((left, right) => left - right);
  const firstLine = lines[0] ?? 1;
  const lastLine = lines.at(-1) ?? firstLine;
  const symbol = smallestContainingSymbol(file, lines);
  const minimum = symbol?.startLine ?? 1;
  const maximum = symbol?.endLine ?? file.lineCount;
  const range = boundedWindow(firstLine, lastLine, minimum, maximum);
  return { symbol, ...range };
}

function regionsOverlap(left: LocatedRegion, right: LocatedRegion): boolean {
  return Math.max(left.startLine, right.startLine) <= Math.min(left.endLine, right.endLine);
}

export function locateTopRegionCandidates(
  file: FileAnalysis,
  evidence: ContentEvidence[],
  maxRegions: number,
): LocatedRegionCandidate[] {
  const limit = Number.isFinite(maxRegions) ? Math.max(0, Math.floor(maxRegions)) : 0;
  if (limit === 0) return [];
  let remaining = uniqueEvidence(evidence);
  const candidates: LocatedRegionCandidate[] = [];

  while (remaining.length > 0 && candidates.length < limit) {
    const cluster = bestCluster(remaining);
    if (cluster.length === 0) break;
    const consumed = new Set(cluster.map(evidenceKey));
    remaining = remaining.filter((item) => !consumed.has(evidenceKey(item)));
    const region = locateCluster(file, cluster);
    if (candidates.some((candidate) => regionsOverlap(candidate, region))) continue;
    const sortedEvidence = [...cluster].sort((left, right) =>
      left.line - right.line || left.term.localeCompare(right.term) || left.field.localeCompare(right.field));
    candidates.push({
      ...region,
      evidence: sortedEvidence,
      distinctTerms: new Set(cluster.map((item) => item.term)).size,
    });
  }

  return candidates;
}

export function locateTopRegions(
  file: FileAnalysis,
  evidence: ContentEvidence[],
  maxRegions: number,
): LocatedRegion[] {
  return locateTopRegionCandidates(file, evidence, maxRegions).map(({ symbol, startLine, endLine }) => ({
    symbol,
    startLine,
    endLine,
  }));
}

export function locateContentRegion(file: FileAnalysis, evidence: ContentEvidence[]): LocatedRegion | null {
  return locateTopRegions(file, evidence, 1)[0] ?? null;
}
