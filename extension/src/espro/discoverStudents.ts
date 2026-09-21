import type { EsproPageAdapter } from "./adapter";
import type { EsproStudent, EsproStudentSnapshot } from "@/types";
import { normalizeIdentifier } from "@/utils/normalize";

export interface DiscoveryResult {
  students: EsproStudent[];
  warnings: string[];
  maxMarks: number | null;
  pagination: { currentPage: number; totalPages: number } | null;
}

/**
 * Reads the currently visible ESPro page through the given adapter. Rows
 * without a resolvable mark input are excluded (nothing to fill) but
 * reported as a warning rather than silently dropped — an unexpected DOM
 * structure should be visible to the faculty member, not swallowed.
 */
export function discoverEsproStudents(doc: Document, adapter: EsproPageAdapter): DiscoveryResult {
  const rows = adapter.findStudentRows(doc);
  const students: EsproStudent[] = [];
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const input = adapter.findMarkInput(row);
    if (!input) {
      warnings.push(`Row ${index + 1}: no mark field could be found and it was skipped.`);
      return;
    }
    const identifierRaw = adapter.extractIdentifier(row);
    students.push({
      rowIndex: index,
      identifierRaw,
      identifierNormalized: normalizeIdentifier(identifierRaw),
      nameRaw: adapter.extractName(row),
      inputElement: input,
      currentValue: "value" in input ? input.value : "",
    });
  });

  return {
    students,
    warnings,
    maxMarks: adapter.getMaxMarks(doc),
    pagination: adapter.getPaginationInfo(doc),
  };
}

export function toSnapshot(student: EsproStudent): EsproStudentSnapshot {
  return {
    rowIndex: student.rowIndex,
    identifierRaw: student.identifierRaw,
    identifierNormalized: student.identifierNormalized,
    nameRaw: student.nameRaw,
    currentValue: student.currentValue,
  };
}
