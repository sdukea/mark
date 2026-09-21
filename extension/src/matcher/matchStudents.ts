import type { ExcelRecord, EsproStudentSnapshot, MatchResult } from "@/types";
import { normalizeNameForCompare } from "@/utils/normalize";
import { validateMark } from "@/validation/markValidation";

export interface MatchOptions {
  /** Maximum allowed mark, if it could be determined from the ESPro page (e.g. "out of 20"). */
  maxMarks: number | null;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * Names are never the primary matcher, but they're a cheap safety net: if an
 * identifier matched but the names look unrelated, that's worth a human
 * looking at before a mark lands on the wrong student. Deliberately loose
 * (substring containment passes) to avoid false alarms on initials/middle
 * names — the goal is catching gross mismatches, not exact equality.
 */
function namesConflict(excelName: string | null, esproName: string | null): boolean {
  if (!excelName || !esproName) return false;
  const a = normalizeNameForCompare(excelName);
  const b = normalizeNameForCompare(esproName);
  if (!a || !b || a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
}

function describeRows(records: ExcelRecord[]): string {
  return records.map((r) => `row ${r.rowNumber}`).join(", ");
}

function describeEsproRows(students: EsproStudentSnapshot[]): string {
  return students.map((s) => `row ${s.rowIndex + 1}`).join(", ");
}

export function matchStudents(
  excelRecords: ExcelRecord[],
  esproStudents: EsproStudentSnapshot[],
  options: MatchOptions,
): MatchResult[] {
  const results: MatchResult[] = [];

  const excelWithId = excelRecords.filter((r) => r.identifierNormalized !== "");
  const excelBlank = excelRecords.filter((r) => r.identifierNormalized === "");
  const esproWithId = esproStudents.filter((s) => s.identifierNormalized !== "");
  const esproBlank = esproStudents.filter((s) => s.identifierNormalized === "");

  for (const r of excelBlank) {
    results.push({
      status: "NOT_FOUND",
      excelRecord: r,
      esproStudent: null,
      markToWrite: null,
      detail: `Row ${r.rowNumber} has a blank identifier and cannot be matched.`,
    });
  }
  for (const s of esproBlank) {
    results.push({
      status: "NOT_FOUND",
      excelRecord: null,
      esproStudent: s,
      markToWrite: null,
      detail: `This ESPro row (position ${s.rowIndex + 1}) has no readable identifier.`,
    });
  }

  const excelById = groupBy(excelWithId, (r) => r.identifierNormalized);
  const esproById = groupBy(esproWithId, (s) => s.identifierNormalized);
  const allIds = new Set<string>([...excelById.keys(), ...esproById.keys()]);

  for (const id of allIds) {
    const excelGroup = excelById.get(id) ?? [];
    const esproGroup = esproById.get(id) ?? [];

    if (excelGroup.length > 1) {
      const detail = `Identifier "${excelGroup[0]!.identifierRaw}" appears ${excelGroup.length} times in the spreadsheet (${describeRows(excelGroup)}).`;
      for (const excelRecord of excelGroup) {
        results.push({
          status: "DUPLICATE_EXCEL",
          excelRecord,
          esproStudent: esproGroup.length === 1 ? toResultSnapshot(esproGroup[0]!) : null,
          markToWrite: null,
          detail,
        });
      }
      continue;
    }

    if (esproGroup.length > 1) {
      const detail = `Identifier "${esproGroup[0]!.identifierRaw}" appears ${esproGroup.length} times on this ESPro page (${describeEsproRows(esproGroup)}).`;
      for (const esproStudent of esproGroup) {
        results.push({
          status: "DUPLICATE_ESPRO",
          excelRecord: excelGroup.length === 1 ? excelGroup[0]! : null,
          esproStudent: toResultSnapshot(esproStudent),
          markToWrite: null,
          detail,
        });
      }
      continue;
    }

    if (excelGroup.length === 1 && esproGroup.length === 0) {
      results.push({
        status: "NOT_FOUND",
        excelRecord: excelGroup[0]!,
        esproStudent: null,
        markToWrite: null,
        detail: "No matching student was found on this ESPro page.",
      });
      continue;
    }

    if (excelGroup.length === 0 && esproGroup.length === 1) {
      results.push({
        status: "NOT_FOUND",
        excelRecord: null,
        esproStudent: toResultSnapshot(esproGroup[0]!),
        markToWrite: null,
        detail: "No record for this student was found in the spreadsheet.",
      });
      continue;
    }

    // Exactly one on each side.
    const excelRecord = excelGroup[0]!;
    const esproStudent = esproGroup[0]!;
    const markValidation = validateMark(excelRecord.markRaw, options.maxMarks);

    if (!markValidation.valid) {
      results.push({
        status: markValidation.reason === "Mark is blank." ? "MISSING_MARK" : "INVALID_MARK",
        excelRecord,
        esproStudent: toResultSnapshot(esproStudent),
        markToWrite: null,
        detail: markValidation.reason ?? "Mark could not be validated.",
      });
      continue;
    }

    if (namesConflict(excelRecord.nameRaw, esproStudent.nameRaw)) {
      results.push({
        status: "IDENTIFIER_CONFLICT",
        excelRecord,
        esproStudent: toResultSnapshot(esproStudent),
        markToWrite: null,
        detail: `Identifiers matched, but names differ: spreadsheet says "${excelRecord.nameRaw}", ESPro shows "${esproStudent.nameRaw}". Verify before filling.`,
      });
      continue;
    }

    if (esproStudent.currentValue.trim() !== "") {
      results.push({
        status: "ALREADY_FILLED",
        excelRecord,
        esproStudent: toResultSnapshot(esproStudent),
        markToWrite: String(markValidation.value),
        detail: `ESPro already has a mark (${esproStudent.currentValue}) for this student. Overwriting requires explicit confirmation.`,
      });
      continue;
    }

    results.push({
      status: "MATCHED",
      excelRecord,
      esproStudent: toResultSnapshot(esproStudent),
      markToWrite: String(markValidation.value),
      detail: "Ready to fill.",
    });
  }

  return results;
}

function toResultSnapshot(s: EsproStudentSnapshot): EsproStudentSnapshot {
  return s;
}

/**
 * Opt-in fallback for when no reliable identifier is available on either
 * side and names are truly the only thing to go on. Matches here are NEVER
 * auto-fillable — they always come back as LOW_CONFIDENCE, full stop. This
 * is intentionally not wired into matchStudents() by default; a caller has
 * to explicitly choose to run it, so name-based matching is never silently
 * in effect.
 */
export function matchByNameFallback(excelRecords: ExcelRecord[], esproStudents: EsproStudentSnapshot[]): MatchResult[] {
  const results: MatchResult[] = [];
  const esproByName = groupBy(
    esproStudents.filter((s) => s.nameRaw),
    (s) => normalizeNameForCompare(s.nameRaw),
  );

  for (const excelRecord of excelRecords) {
    const key = normalizeNameForCompare(excelRecord.nameRaw);
    const candidates = key ? esproByName.get(key) ?? [] : [];
    if (candidates.length !== 1) continue;
    results.push({
      status: "LOW_CONFIDENCE",
      excelRecord,
      esproStudent: toResultSnapshot(candidates[0]!),
      markToWrite: null,
      detail: "Matched by name only, with no reliable identifier available. Names are not a safe basis for an automatic fill — verify manually.",
    });
  }
  return results;
}
