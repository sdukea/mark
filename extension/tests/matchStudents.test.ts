import { describe, expect, it } from "vitest";
import { matchByNameFallback, matchStudents } from "@/matcher/matchStudents";
import type { ExcelRecord, EsproStudentSnapshot } from "@/types";
import { normalizeIdentifier } from "@/utils/normalize";

let nextRow = 2;
function excel(identifier: string, name: string | null, mark: string | number | null): ExcelRecord {
  return {
    rowNumber: nextRow++,
    identifierRaw: identifier,
    identifierNormalized: normalizeIdentifier(identifier),
    nameRaw: name,
    markRaw: mark,
  };
}

function espro(rowIndex: number, identifier: string, name: string | null, currentValue = ""): EsproStudentSnapshot {
  return {
    rowIndex,
    identifierRaw: identifier,
    identifierNormalized: normalizeIdentifier(identifier),
    nameRaw: name,
    currentValue,
  };
}

const MAX = 20;

describe("matchStudents", () => {
  it("1. matches a clean identifier + valid mark pair", () => {
    const results = matchStudents(
      [excel("1DT21CS001", "Aditi Sharma", 18)],
      [espro(0, "1DT21CS001", "Aditi Sharma")],
      { maxMarks: MAX },
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("MATCHED");
    expect(results[0]!.markToWrite).toBe("18");
  });

  it("2. flags a student present in Excel but missing from ESPro", () => {
    const results = matchStudents([excel("1DT21CS999", "Ghost Student", 18)], [], { maxMarks: MAX });
    expect(results[0]!.status).toBe("NOT_FOUND");
    expect(results[0]!.esproStudent).toBeNull();
  });

  it("3. flags a student present on ESPro but missing from Excel", () => {
    const results = matchStudents([], [espro(0, "1DT21CS001", "Aditi Sharma")], { maxMarks: MAX });
    expect(results[0]!.status).toBe("NOT_FOUND");
    expect(results[0]!.excelRecord).toBeNull();
  });

  it("4. flags a duplicate identifier within the Excel sheet, never picking one", () => {
    const results = matchStudents(
      [excel("1DT21CS001", "Aditi Sharma", 18), excel("1DT21CS001", "Aditi Sharma", 19)],
      [espro(0, "1DT21CS001", "Aditi Sharma")],
      { maxMarks: MAX },
    );
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe("DUPLICATE_EXCEL");
      expect(r.markToWrite).toBeNull();
    }
  });

  it("5. flags a duplicate identifier among ESPro rows, never picking one", () => {
    const results = matchStudents(
      [excel("1DT21CS010", "Meera Pillai", 19)],
      [espro(9, "1DT21CS010", "Meera Pillai"), espro(10, "1DT21CS010", "Meera Pillai")],
      { maxMarks: MAX },
    );
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe("DUPLICATE_ESPRO");
      expect(r.markToWrite).toBeNull();
    }
  });

  it("6. flags a blank mark", () => {
    const results = matchStudents([excel("1DT21CS001", "Aditi Sharma", null)], [espro(0, "1DT21CS001", "Aditi Sharma")], {
      maxMarks: MAX,
    });
    expect(results[0]!.status).toBe("MISSING_MARK");
  });

  it("7. flags a non-numeric mark and an out-of-range mark", () => {
    const nonNumeric = matchStudents([excel("1DT21CS001", "A", "absent")], [espro(0, "1DT21CS001", "A")], { maxMarks: MAX });
    expect(nonNumeric[0]!.status).toBe("INVALID_MARK");

    const outOfRange = matchStudents([excel("1DT21CS002", "B", 25)], [espro(0, "1DT21CS002", "B")], { maxMarks: MAX });
    expect(outOfRange[0]!.status).toBe("INVALID_MARK");
  });

  it("8. flags an ESPro field that already has a mark instead of overwriting silently", () => {
    const results = matchStudents(
      [excel("1DT21CS005", "Priya Nair", 17)],
      [espro(4, "1DT21CS005", "Priya Nair", "15")],
      { maxMarks: MAX },
    );
    expect(results[0]!.status).toBe("ALREADY_FILLED");
    // The intended value is surfaced for the preview, but nothing should be
    // treated as auto-fillable for this status by the fill engine.
    expect(results[0]!.markToWrite).toBe("17");
  });

  it("9. tolerates harmless name variation (case/whitespace) without flagging a conflict", () => {
    const results = matchStudents(
      [excel("1DT21CS014", "  aakash   verma ", 15)],
      [espro(13, "1DT21CS014", "Aakash Verma")],
      { maxMarks: MAX },
    );
    expect(results[0]!.status).toBe("MATCHED");
  });

  it("9b. flags genuinely different names on a matched identifier as a conflict, not a silent match", () => {
    const results = matchStudents(
      [excel("1DT21CS001", "Aditi Sharma", 18)],
      [espro(0, "1DT21CS001", "Someone Else Entirely")],
      { maxMarks: MAX },
    );
    expect(results[0]!.status).toBe("IDENTIFIER_CONFLICT");
    expect(results[0]!.markToWrite).toBeNull();
  });

  it("10. matches despite identifier whitespace differences", () => {
    const results = matchStudents(
      [excel(" 1DT21CS001 ", "Aditi Sharma", 18)],
      [espro(0, "1DT21CS001", "Aditi Sharma")],
      { maxMarks: MAX },
    );
    expect(results[0]!.status).toBe("MATCHED");
  });

  it("11. matches despite identifier case differences", () => {
    const results = matchStudents(
      [excel("1dt21cs001", "Aditi Sharma", 18)],
      [espro(0, "1DT21CS001", "Aditi Sharma")],
      { maxMarks: MAX },
    );
    expect(results[0]!.status).toBe("MATCHED");
  });

  it("12. handles a large class correctly", () => {
    const excelRecords: ExcelRecord[] = [];
    const esproStudents: EsproStudentSnapshot[] = [];
    for (let i = 0; i < 500; i++) {
      const id = `1DT21CS${String(i).padStart(3, "0")}`;
      excelRecords.push(excel(id, `Student ${i}`, i % 21));
      esproStudents.push(espro(i, id, `Student ${i}`));
    }
    const results = matchStudents(excelRecords, esproStudents, { maxMarks: MAX });
    expect(results).toHaveLength(500);
    expect(results.every((r) => r.status === "MATCHED")).toBe(true);
  });

  it("13. produces NOT_FOUND for every ESPro row when the spreadsheet has no records", () => {
    const results = matchStudents([], [espro(0, "1DT21CS001", "Aditi Sharma"), espro(1, "1DT21CS002", "Rohan Mehta")], {
      maxMarks: MAX,
    });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "NOT_FOUND")).toBe(true);
  });

  it("flags rows with a blank identifier on either side instead of dropping them silently", () => {
    const results = matchStudents([excel("", "Mystery Row", 18)], [espro(0, "", "Unregistered Student")], {
      maxMarks: MAX,
    });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "NOT_FOUND")).toBe(true);
  });
});

describe("matchByNameFallback", () => {
  it("only ever returns LOW_CONFIDENCE, never an auto-fillable status", () => {
    const results = matchByNameFallback(
      [excel("", "Aditi Sharma", 18)],
      [espro(0, "", "Aditi Sharma")],
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("LOW_CONFIDENCE");
    expect(results[0]!.markToWrite).toBeNull();
  });

  it("refuses to guess when a name matches more than one ESPro row", () => {
    const results = matchByNameFallback(
      [excel("", "Common Name", 18)],
      [espro(0, "", "Common Name"), espro(1, "", "Common Name")],
    );
    expect(results).toHaveLength(0);
  });
});
