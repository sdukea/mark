import * as XLSX from "xlsx";
import type { ColumnDetectionCandidate, ExcelRecord, ParsedWorkbook } from "@/types";
import { normalizeIdentifier } from "@/utils/normalize";
import { detectIdentifierColumn, detectMarkColumn, detectNameColumn } from "./columnDetection";

export interface ColumnSelection {
  sheetName?: string;
  identifierColumn?: string;
  markColumn?: string;
  nameColumn?: string | null;
}

export interface NeedsColumnSelection {
  status: "needs-column-selection";
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  identifier: { candidates: ColumnDetectionCandidate[]; resolved: string | null };
  mark: { candidates: ColumnDetectionCandidate[]; resolved: string | null };
  name: { candidates: ColumnDetectionCandidate[]; resolved: string | null };
}

export interface ParseError {
  status: "error";
  message: string;
  sheetNames?: string[];
}

export interface ParseOk {
  status: "ok";
  workbook: ParsedWorkbook;
}

export type ParseResult = ParseOk | NeedsColumnSelection | ParseError;

/** Rows where every cell is empty are almost always trailing spreadsheet artifacts, not real records. */
function isRowBlank(row: unknown[]): boolean {
  return row.every((cell) => cell === undefined || cell === null || String(cell).trim() === "");
}

export function parseWorkbook(buffer: ArrayBuffer, selection: ColumnSelection = {}): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { status: "error", message: "This file could not be read as an Excel workbook. Make sure it is a valid .xlsx file." };
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return { status: "error", message: "This workbook has no sheets." };
  }

  const sheetName = selection.sheetName ?? sheetNames[0]!;
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { status: "error", message: `Sheet "${sheetName}" was not found in this workbook.`, sheetNames };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", blankrows: false });
  if (rows.length === 0) {
    return { status: "error", message: `Sheet "${sheetName}" is empty.`, sheetNames };
  }

  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1).filter((row) => !isRowBlank(row));

  if (headers.every((h) => h === "")) {
    return { status: "error", message: `Sheet "${sheetName}" does not appear to have a header row.`, sheetNames };
  }
  if (dataRows.length === 0) {
    return { status: "error", message: `Sheet "${sheetName}" has headers but no student rows below them.`, sheetNames };
  }

  const identifierDetected = detectIdentifierColumn(headers);
  const markDetected = detectMarkColumn(headers);
  const nameDetected = detectNameColumn(headers);

  const identifierColumn = selection.identifierColumn ?? identifierDetected.autoSelected?.header ?? null;
  const markColumn = selection.markColumn ?? markDetected.autoSelected?.header ?? null;
  const nameColumn = selection.nameColumn !== undefined ? selection.nameColumn : nameDetected.autoSelected?.header ?? null;

  if (!identifierColumn || !markColumn) {
    return {
      status: "needs-column-selection",
      sheetName,
      sheetNames,
      headers,
      identifier: { candidates: identifierDetected.candidates, resolved: identifierColumn },
      mark: { candidates: markDetected.candidates, resolved: markColumn },
      name: { candidates: nameDetected.candidates, resolved: nameColumn },
    };
  }

  const identifierIdx = headers.indexOf(identifierColumn);
  const markIdx = headers.indexOf(markColumn);
  const nameIdx = nameColumn ? headers.indexOf(nameColumn) : -1;

  if (identifierIdx === -1) {
    return { status: "error", message: `Column "${identifierColumn}" was not found in this sheet.`, sheetNames };
  }
  if (markIdx === -1) {
    return { status: "error", message: `Column "${markColumn}" was not found in this sheet.`, sheetNames };
  }

  const warnings: string[] = [];
  const blankSkipped = rows.slice(1).length - dataRows.length;
  if (blankSkipped > 0) {
    warnings.push(`${blankSkipped} fully blank row(s) were skipped.`);
  }

  const records: ExcelRecord[] = dataRows.map((row, i) => {
    const identifierRaw = String(row[identifierIdx] ?? "").trim();
    const nameRawValue = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
    const markCell = row[markIdx];
    return {
      rowNumber: i + 2, // +1 for header row, +1 to go from 0-index to 1-index
      identifierRaw,
      identifierNormalized: normalizeIdentifier(identifierRaw),
      nameRaw: nameRawValue || null,
      markRaw: markCell === "" || markCell === undefined ? null : (markCell as string | number),
    };
  });

  const blankIdentifierCount = records.filter((r) => r.identifierNormalized === "").length;
  if (blankIdentifierCount > 0) {
    warnings.push(`${blankIdentifierCount} row(s) have a blank identifier and cannot be matched.`);
  }

  return {
    status: "ok",
    workbook: {
      fileName: "",
      sheetName,
      headers,
      records,
      identifierColumn,
      markColumn,
      nameColumn,
      warnings,
    },
  };
}

export function listSheetNames(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array", bookSheets: true });
  return workbook.SheetNames;
}
