import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/parser/xlsxParser";

function bufferFromRows(rows: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

describe("parseWorkbook", () => {
  it("parses a clean sheet with auto-detected columns", () => {
    const buffer = bufferFromRows([
      ["USN", "Student Name", "Internal Marks"],
      ["1DT21CS001", "Aditi Sharma", 18],
      ["1DT21CS002", "Rohan Mehta", 16],
    ]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.workbook.identifierColumn).toBe("USN");
    expect(result.workbook.markColumn).toBe("Internal Marks");
    expect(result.workbook.nameColumn).toBe("Student Name");
    expect(result.workbook.records).toHaveLength(2);
    expect(result.workbook.records[0]).toMatchObject({
      identifierRaw: "1DT21CS001",
      identifierNormalized: "1DT21CS001",
      nameRaw: "Aditi Sharma",
      markRaw: 18,
      rowNumber: 2,
    });
  });

  it("asks for column selection when the identifier column is ambiguous", () => {
    const buffer = bufferFromRows([
      ["USN", "Roll No", "Name", "Marks"],
      ["1DT21CS001", "R001", "Aditi Sharma", 18],
    ]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("needs-column-selection");
    if (result.status !== "needs-column-selection") return;
    expect(result.identifier.resolved).toBeNull();
    expect(result.identifier.candidates.map((c) => c.header)).toEqual(expect.arrayContaining(["USN", "Roll No"]));
  });

  it("resolves after an explicit column selection is supplied", () => {
    const buffer = bufferFromRows([
      ["USN", "Roll No", "Name", "Marks"],
      ["1DT21CS001", "R001", "Aditi Sharma", 18],
    ]);
    const result = parseWorkbook(buffer, { identifierColumn: "USN", markColumn: "Marks" });
    expect(result.status).toBe("ok");
  });

  it("rejects an empty sheet", () => {
    const buffer = bufferFromRows([]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("error");
  });

  it("rejects a sheet with headers but no data rows", () => {
    const buffer = bufferFromRows([["USN", "Name", "Marks"]]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("error");
  });

  it("rejects a wrong/unrelated spreadsheet with no recognizable columns", () => {
    const buffer = bufferFromRows([
      ["Date", "Department", "Remarks"],
      ["2026-01-01", "CSE", "ok"],
    ]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("needs-column-selection");
    if (result.status !== "needs-column-selection") return;
    expect(result.identifier.candidates).toHaveLength(0);
    expect(result.mark.candidates).toHaveLength(0);
  });

  it("skips fully blank trailing rows but keeps rows with a blank identifier", () => {
    const buffer = bufferFromRows([
      ["USN", "Name", "Marks"],
      ["1DT21CS001", "Aditi Sharma", 18],
      ["", "", ""],
      ["", "Unregistered Student", 15],
    ]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.workbook.records).toHaveLength(2);
    expect(result.workbook.records[1]!.identifierNormalized).toBe("");
    expect(result.workbook.warnings.some((w) => w.includes("blank identifier"))).toBe(true);
  });

  it("normalizes identifiers for whitespace and case differences", () => {
    const buffer = bufferFromRows([
      ["USN", "Name", "Marks"],
      [" 1dt21cs001 ", "Aditi Sharma", 18],
    ]);
    const result = parseWorkbook(buffer);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.workbook.records[0]!.identifierNormalized).toBe("1DT21CS001");
  });
});
