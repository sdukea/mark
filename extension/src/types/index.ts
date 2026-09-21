/** A single student record parsed from the faculty's Excel file. */
export interface ExcelRecord {
  /** Row number in the original sheet (1-indexed, header excluded) — for user-facing references. */
  rowNumber: number;
  /** Raw identifier value as it appeared in the sheet (e.g. "1DT21CS001"). */
  identifierRaw: string;
  /** Normalized identifier used for matching (trimmed, uppercased, internal whitespace collapsed). */
  identifierNormalized: string;
  nameRaw: string | null;
  /** Raw mark cell value as it appeared (could be text, blank, or a number). */
  markRaw: string | number | null;
}

/** A single student row discovered on the live ESPro page. */
export interface EsproStudent {
  /** Stable index of this row within the currently visible page/section (0-indexed). */
  rowIndex: number;
  identifierRaw: string;
  identifierNormalized: string;
  nameRaw: string | null;
  /** The mark input element itself, kept as a live DOM reference (content-script side only). */
  inputElement: HTMLInputElement | HTMLSelectElement;
  /** Current value already present in the field, at discovery time. */
  currentValue: string;
}

/** Serializable projection of EsproStudent for messaging across the extension (no DOM refs). */
export interface EsproStudentSnapshot {
  rowIndex: number;
  identifierRaw: string;
  identifierNormalized: string;
  nameRaw: string | null;
  currentValue: string;
}

export type MatchStatus =
  | "MATCHED"
  | "NOT_FOUND"
  | "DUPLICATE_EXCEL"
  | "DUPLICATE_ESPRO"
  | "MISSING_MARK"
  | "INVALID_MARK"
  | "IDENTIFIER_CONFLICT"
  | "ALREADY_FILLED"
  | "LOW_CONFIDENCE";

export interface MatchResult {
  status: MatchStatus;
  excelRecord: ExcelRecord | null;
  esproStudent: EsproStudentSnapshot | null;
  /** Parsed, validated mark ready to write — present only when status allows filling. */
  markToWrite: string | null;
  /** Human-readable explanation shown in the preview table. */
  detail: string;
}

export interface FillOutcome {
  rowIndex: number;
  identifier: string;
  expected: string;
  actual: string | null;
  status: "VERIFIED" | "MISMATCH" | "FAILED" | "SKIPPED";
}

export interface ParsedWorkbook {
  fileName: string;
  sheetName: string;
  headers: string[];
  records: ExcelRecord[];
  identifierColumn: string;
  markColumn: string;
  nameColumn: string | null;
  warnings: string[];
}

export interface ColumnDetectionCandidate {
  header: string;
  columnIndex: number;
  confidence: number;
}
