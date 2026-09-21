import { describe, expect, it } from "vitest";
import { detectIdentifierColumn, detectMarkColumn, detectNameColumn } from "@/parser/columnDetection";

describe("detectIdentifierColumn", () => {
  it("recognizes common identifier header variants", () => {
    for (const header of ["USN", "Register Number", "Roll No", "Student ID", "University Seat Number"]) {
      const result = detectIdentifierColumn(["Sl No", header, "Name", "Marks"]);
      expect(result.autoSelected?.header).toBe(header);
    }
  });

  it("does not auto-select when two columns look equally identifier-like", () => {
    const result = detectIdentifierColumn(["USN", "Roll No", "Name", "Marks"]);
    expect(result.autoSelected).toBeNull();
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("returns no candidates for a sheet with no identifier-like column", () => {
    const result = detectIdentifierColumn(["Date", "Remarks"]);
    expect(result.autoSelected).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });
});

describe("detectMarkColumn", () => {
  it("prefers exact 'Marks' style headers over 'Max Marks'", () => {
    const result = detectMarkColumn(["USN", "Name", "Max Marks", "Internal Assessment"]);
    expect(result.autoSelected?.header).toBe("Internal Assessment");
  });

  it("excludes a lone 'Max Marks' column entirely", () => {
    const result = detectMarkColumn(["USN", "Name", "Max Marks"]);
    expect(result.candidates).toHaveLength(0);
  });

  it("is ambiguous between 'Marks' and 'Total' when both present", () => {
    const result = detectMarkColumn(["USN", "Name", "Marks", "Total"]);
    expect(result.autoSelected).toBeNull();
  });
});

describe("detectNameColumn", () => {
  it("recognizes 'Student Name' and plain 'Name'", () => {
    expect(detectNameColumn(["USN", "Student Name", "Marks"]).autoSelected?.header).toBe("Student Name");
    expect(detectNameColumn(["USN", "Name", "Marks"]).autoSelected?.header).toBe("Name");
  });
});
