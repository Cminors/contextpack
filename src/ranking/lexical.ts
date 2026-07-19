import type ts from "typescript";
import type {
  FileAnalysis,
  LexicalContentField,
  LexicalDocument,
  LexicalOccurrence,
} from "../types.js";
import { containsLikelySecret } from "../utils/security.js";
import { textTerms } from "../utils/task-terms.js";

export const LEXICAL_LIMITS = {
  maxCharacters: 100_000,
  maxDistinctTerms: 12_000,
  maxOccurrences: 24_000,
  maxOccurrencesPerTerm: 8,
} as const;

export const CONTENT_FIELD_WEIGHTS: Record<LexicalContentField, number> = {
  comment: 1.1,
  identifier: 0.7,
  string: 0.9,
  "test-title": 1.25,
};

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const CONTENT_TOKEN = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$\u3400-\u9fff][\w$\u3400-\u9fff]*/g;
const PYTHON_CONTENT_TOKEN = /#[^\r\n]*|'''(?:\\.|(?!''')[\s\S])*?'''|"""(?:\\.|(?!""")[\s\S])*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_$\u3400-\u9fff][\w$\u3400-\u9fff]*/g;
const MODULE_PREFIX = /\b(?:from|import|require)\s*(?:\(\s*)?$/;
const TEST_TITLE_PREFIX = /\b(?:describe|it|suite|test)(?:\s*\.\s*(?:concurrent|each|only|skip|todo))*\s*\(\s*$/;
const ASCII_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SOURCE_STOP_WORDS = new Set([
  "any", "async", "await", "boolean", "break", "case", "catch", "class", "const", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "from", "function", "get", "if", "implements", "import", "in", "instanceof",
  "interface", "keyof", "let", "module", "namespace", "never", "new", "null", "number", "object",
  "of", "package", "private", "protected", "public", "readonly", "require", "return", "set", "static",
  "string", "super", "switch", "symbol", "this", "throw", "true", "try", "type", "typeof", "undefined",
  "unknown", "var", "void", "while", "with", "yield",
]);
const FIELD_CHARACTER_LIMITS: Record<LexicalContentField, number> = {
  comment: 2_000,
  identifier: 256,
  string: 512,
  "test-title": 1_000,
};
const QUERY_DOCUMENT_CACHE = new WeakMap<FileAnalysis, Map<string, LexicalDocument>>();

export interface ContentEvidence {
  term: string;
  field: LexicalContentField;
  line: number;
  relevance?: number;
}

export interface ContentMatch {
  score: number;
  evidence: ContentEvidence[];
  localizationEvidence: ContentEvidence[];
}

function contentTerms(
  value: string,
  field: LexicalContentField,
  queryTerms?: ReadonlySet<string>,
): string[] {
  if (queryTerms) {
    if (field === "identifier" && ASCII_IDENTIFIER.test(value)) {
      return value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[\s_$]+/)
        .filter((term) => queryTerms.has(term));
    }
    const normalized = value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ");
    const padded = ` ${normalized} `;
    return [...queryTerms].filter((term) =>
      /[\u3400-\u9fff]/.test(term) ? normalized.includes(term) : padded.includes(` ${term} `),
    );
  }
  if (field !== "identifier" || !ASCII_IDENTIFIER.test(value)) return textTerms(value);
  const terms = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_$]+/)
    .filter((term) => term.length >= 2 && !SOURCE_STOP_WORDS.has(term));
  return [...new Set(terms)].sort();
}

export function extractLexicalDocument(
  content: string,
  filePath: string,
  _sourceFile?: ts.SourceFile,
  queryTerms?: ReadonlySet<string>,
): LexicalDocument {
  const limited = content.slice(0, LEXICAL_LIMITS.maxCharacters);
  const termWeights = Object.create(null) as Record<string, number>;
  const occurrences: LexicalOccurrence[] = [];
  const occurrenceKeys = new Set<string>();
  const counts = new Map<string, number>();
  let length = 0;

  const addText = (value: string, field: LexicalContentField, line: number): void => {
    if (
      !value
      || length >= LEXICAL_LIMITS.maxOccurrences
      || (field !== "identifier" && containsLikelySecret(value))
    ) return;
    const terms = contentTerms(value.slice(0, FIELD_CHARACTER_LIMITS[field]), field, queryTerms);
    if (terms.length === 0) return;
    for (const term of terms) {
      const count = counts.get(term) ?? 0;
      if (count >= LEXICAL_LIMITS.maxOccurrencesPerTerm) continue;
      if (count === 0 && counts.size >= LEXICAL_LIMITS.maxDistinctTerms) continue;
      counts.set(term, count + 1);
      termWeights[term] = (termWeights[term] ?? 0) + CONTENT_FIELD_WEIGHTS[field];
      const occurrenceKey = `${term}\0${field}\0${line}`;
      if (!occurrenceKeys.has(occurrenceKey)) {
        occurrenceKeys.add(occurrenceKey);
        occurrences.push({ term, field, line });
      }
      length += 1;
      if (length >= LEXICAL_LIMITS.maxOccurrences) break;
    }
  };

  let line = 1;
  let traversed = 0;
  const tokenPattern = /\.py$/i.test(filePath) ? PYTHON_CONTENT_TOKEN : CONTENT_TOKEN;
  for (const match of limited.matchAll(tokenPattern)) {
    const position = match.index;
    for (let index = traversed; index < position; index += 1) {
      if (limited.charCodeAt(index) === 10) line += 1;
    }
    const value = match[0];
    const prefix = limited.slice(Math.max(0, position - 96), position);
    if (value.startsWith("//") || value.startsWith("/*") || value.startsWith("#")) {
      addText(value, "comment", line);
    } else if (value.startsWith("'") || value.startsWith('"') || value.startsWith("`")) {
      if (!MODULE_PREFIX.test(prefix)) {
        addText(value, TEST_TITLE_PREFIX.test(prefix) ? "test-title" : "string", line);
      }
    } else {
      addText(value, "identifier", line);
    }
    for (let index = position; index < position + value.length; index += 1) {
      if (limited.charCodeAt(index) === 10) line += 1;
    }
    traversed = position + value.length;
  }

  return {
    length: queryTerms ? Math.max(1, limited.length) : length,
    termWeights,
    occurrences,
  };
}

function lexicalDocument(file: FileAnalysis, queryTerms: ReadonlySet<string>): LexicalDocument {
  if (file.lexicalDocument) return file.lexicalDocument;
  const key = [...queryTerms].sort().join("\0");
  let cached = QUERY_DOCUMENT_CACHE.get(file);
  if (!cached) {
    cached = new Map();
    QUERY_DOCUMENT_CACHE.set(file, cached);
  }
  const document = cached.get(key) ?? extractLexicalDocument(file.content, file.path, undefined, queryTerms);
  cached.set(key, document);
  return document;
}

export function scoreContentMatches(files: FileAnalysis[], terms: string[]): Map<string, ContentMatch> {
  const queryTerms = [...new Set(terms)];
  if (queryTerms.length === 0) return new Map();
  const queryTermSet = new Set(queryTerms);
  const documents = files
    .filter((file) =>
      !file.isConfig
      && (file.language === "javascript" || file.language === "typescript" || file.language === "python"),
    )
    .map((file) => ({ file, document: lexicalDocument(file, queryTermSet) }));
  if (documents.length === 0) return new Map();

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      documents.filter(({ document }) => (document.termWeights[term] ?? 0) > 0).length,
    );
  }
  const averageLength = Math.max(
    1,
    documents.reduce((sum, { document }) => sum + document.length, 0) / documents.length,
  );
  const denominator = Math.max(2, Math.min(queryTerms.length, 6));
  const matches = new Map<string, ContentMatch>();

  for (const { file, document } of documents) {
    const contributions: Array<{ term: string; value: number }> = [];
    const lengthNormalization = 1 - BM25_B + BM25_B * (document.length / averageLength);
    for (const term of queryTerms) {
      const termFrequency = document.termWeights[term] ?? 0;
      if (termFrequency <= 0) continue;
      const frequency = documentFrequency.get(term) ?? 0;
      const inverseDocumentFrequency = Math.log(
        1 + (documents.length - frequency + 0.5) / (frequency + 0.5),
      );
      const rarity = inverseDocumentFrequency / (inverseDocumentFrequency + 1);
      const saturation = termFrequency / (termFrequency + BM25_K1 * lengthNormalization);
      contributions.push({ term, value: rarity * saturation });
    }
    if (contributions.length === 0) continue;
    contributions.sort((left, right) => right.value - left.value || left.term.localeCompare(right.term));
    const matchedTerms = new Set(contributions.map((item) => item.term));
    const bestOccurrence = new Map<string, LexicalOccurrence>();
    for (const occurrence of document.occurrences) {
      if (!matchedTerms.has(occurrence.term)) continue;
      const current = bestOccurrence.get(occurrence.term);
      if (
        !current
        || CONTENT_FIELD_WEIGHTS[occurrence.field] > CONTENT_FIELD_WEIGHTS[current.field]
        || (CONTENT_FIELD_WEIGHTS[occurrence.field] === CONTENT_FIELD_WEIGHTS[current.field] && occurrence.line < current.line)
      ) {
        bestOccurrence.set(occurrence.term, occurrence);
      }
    }
    const matchedCount = contributions.length;
    const coverageRatio = matchedCount / Math.max(1, queryTerms.length);
    const coverageMultiplier = Math.pow(coverageRatio, 0.4);
    const score = Math.min(
      1,
      (contributions.reduce((sum, item) => sum + item.value, 0) / denominator) * coverageMultiplier,
    );
    const contributionByTerm = new Map(contributions.map((item) => [item.term, item.value]));
    const localizationEvidence = document.occurrences
      .filter((item) => matchedTerms.has(item.term))
      .sort((left, right) =>
        (contributionByTerm.get(right.term) ?? 0) - (contributionByTerm.get(left.term) ?? 0)
        || CONTENT_FIELD_WEIGHTS[right.field] - CONTENT_FIELD_WEIGHTS[left.field]
        || left.line - right.line
        || left.term.localeCompare(right.term),
      )
      .slice(0, 256)
      .map(({ term, field, line }) => ({
        term,
        field,
        line,
        relevance: contributionByTerm.get(term) ?? 0,
      }));
    const evidence = contributions
      .map((item) => bestOccurrence.get(item.term))
      .filter((item): item is LexicalOccurrence => item !== undefined)
      .slice(0, 4)
      .map(({ term, field, line }) => ({ term, field, line }));
    matches.set(file.path, { score, evidence, localizationEvidence });
  }

  return matches;
}
