import type { EsproPageAdapter } from "./adapter";
import type { FillOutcome } from "@/types";
import { discoverEsproStudents } from "./discoverStudents";
import { fillAndVerifyOne } from "./fillAndVerify";
import { normalizeIdentifier } from "@/utils/normalize";

export interface FillPlanEntry {
  rowIndex: number;
  identifier: string;
  value: string;
}

/**
 * Executes a fill plan built from an earlier preview. Deliberately re-reads
 * the live DOM and re-checks each row's identifier right before writing,
 * rather than trusting the stale references gathered when the preview was
 * built — the page may have re-rendered, re-sorted, or the faculty member
 * may have navigated away and back in between. A row whose identifier no
 * longer matches what the preview expected is refused, not force-filled.
 */
export function executeFillPlan(doc: Document, adapter: EsproPageAdapter, plan: FillPlanEntry[]): FillOutcome[] {
  const discovery = discoverEsproStudents(doc, adapter);
  const byRowIndex = new Map(discovery.students.map((s) => [s.rowIndex, s]));

  return plan.map((entry) => {
    const student = byRowIndex.get(entry.rowIndex);

    if (!student) {
      return {
        rowIndex: entry.rowIndex,
        identifier: entry.identifier,
        expected: entry.value,
        actual: null,
        status: "SKIPPED",
      };
    }

    if (student.identifierNormalized !== normalizeIdentifier(entry.identifier)) {
      return {
        rowIndex: entry.rowIndex,
        identifier: entry.identifier,
        expected: entry.value,
        actual: student.currentValue,
        status: "FAILED",
      };
    }

    return fillAndVerifyOne(student, entry.value);
  });
}
