import type { ColumnDetectionCandidate } from "@/types";

interface KeywordRule {
  keywords: string[];
  /** Header substrings that disqualify a column even if a keyword matches (e.g. "max marks" is not the marks column). */
  exclude?: string[];
}

const IDENTIFIER_RULE: KeywordRule = {
  keywords: [
    "usn",
    "register number",
    "registration number",
    "reg no",
    "reg. no",
    "reg num",
    "roll number",
    "roll no",
    "student id",
    "studentid",
    "university id",
    "university seat number",
    "seat number",
    "enrollment number",
    "enrollment no",
    "enrolment number",
    "admission number",
    "admission no",
    "id",
  ],
};

const NAME_RULE: KeywordRule = {
  keywords: ["student name", "full name", "candidate name", "name"],
};

const MARK_RULE: KeywordRule = {
  keywords: [
    "internal assessment",
    "internal marks",
    "ia marks",
    "ca marks",
    "assignment marks",
    "marks obtained",
    "obtained marks",
    "marks",
    "mark",
    "score",
    "total",
  ],
  exclude: ["max", "maximum", "out of", "possible"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreHeader(header: string, rule: KeywordRule): number {
  const normalized = normalizeHeader(header);
  if (!normalized) return 0;
  if (rule.exclude?.some((ex) => normalized.includes(ex))) return 0;

  let best = 0;
  for (const keyword of rule.keywords) {
    if (normalized === keyword) {
      best = Math.max(best, 1.0);
    } else if (new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(normalized)) {
      best = Math.max(best, 0.75);
    } else if (normalized.includes(keyword)) {
      best = Math.max(best, 0.5);
    }
  }
  return best;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rankCandidates(headers: string[], rule: KeywordRule): ColumnDetectionCandidate[] {
  return headers
    .map((header, columnIndex) => ({
      header,
      columnIndex,
      confidence: scoreHeader(header, rule),
    }))
    .filter((c) => c.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

export interface ColumnDetectionResult {
  candidates: ColumnDetectionCandidate[];
  /** The best candidate IF it is unambiguous (clear winner above threshold), otherwise null. */
  autoSelected: ColumnDetectionCandidate | null;
}

const AUTO_SELECT_MIN_CONFIDENCE = 0.7;
const AMBIGUITY_MARGIN = 0.15;

function toResult(candidates: ColumnDetectionCandidate[]): ColumnDetectionResult {
  if (candidates.length === 0) return { candidates, autoSelected: null };
  const [top, second] = candidates;
  const isAmbiguous =
    second !== undefined &&
    top.confidence - second.confidence < AMBIGUITY_MARGIN &&
    second.confidence >= AUTO_SELECT_MIN_CONFIDENCE - AMBIGUITY_MARGIN;
  if (top.confidence >= AUTO_SELECT_MIN_CONFIDENCE && !isAmbiguous) {
    return { candidates, autoSelected: top };
  }
  return { candidates, autoSelected: null };
}

export function detectIdentifierColumn(headers: string[]): ColumnDetectionResult {
  return toResult(rankCandidates(headers, IDENTIFIER_RULE));
}

export function detectNameColumn(headers: string[]): ColumnDetectionResult {
  return toResult(rankCandidates(headers, NAME_RULE));
}

export function detectMarkColumn(headers: string[]): ColumnDetectionResult {
  return toResult(rankCandidates(headers, MARK_RULE));
}
