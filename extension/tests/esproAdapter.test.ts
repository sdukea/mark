import { beforeEach, describe, expect, it } from "vitest";
import { mockEsproAdapter } from "@/espro/mockAdapter";
import { discoverEsproStudents } from "@/espro/discoverStudents";
import { getActiveAdapter } from "@/espro/registry";

function row(index: number, usn: string, name: string, markValue = ""): string {
  return `
    <tr data-row-index="${index}">
      <td class="col-sl">${index + 1}</td>
      <td class="col-usn"><span id="ctl00_MainContent_gvMarks_ctl${String(index + 2).padStart(2, "0")}_lblUSN">${usn || "—"}</span></td>
      <td class="col-name"><span>${name}</span></td>
      <td class="col-marks"><input type="text" class="marks-input" id="ctl00_MainContent_gvMarks_ctl${String(index + 2).padStart(2, "0")}_txtMarks" value="${markValue}" /></td>
      <td class="col-status"><span data-role="status-pill">${markValue ? "Filled" : "Empty"}</span></td>
    </tr>`;
}

function buildPage(rows: string, page = 1, totalPages = 2): void {
  document.body.innerHTML = `
    <div>
      <span id="ctl00_MainContent_lblMaxMarks">20</span>
    </div>
    <table id="ctl00_MainContent_gvMarks">
      <tbody id="studentTableBody">${rows}</tbody>
    </table>
    <span id="pageIndicator">Page ${page} of ${totalPages}</span>
  `;
}

describe("mockEsproAdapter + discoverEsproStudents", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("recognizes the mock page and extracts clean student rows", () => {
    buildPage(row(0, "1DT21CS001", "Aditi Sharma") + row(1, "1DT21CS002", "Rohan Mehta", "15"));
    expect(mockEsproAdapter.matchesCurrentPage(document)).toBe(true);

    const result = discoverEsproStudents(document, mockEsproAdapter);
    expect(result.students).toHaveLength(2);
    expect(result.students[0]).toMatchObject({ identifierRaw: "1DT21CS001", identifierNormalized: "1DT21CS001", currentValue: "" });
    expect(result.students[1]).toMatchObject({ identifierRaw: "1DT21CS002", currentValue: "15" });
    expect(result.maxMarks).toBe(20);
    expect(result.pagination).toEqual({ currentPage: 1, totalPages: 2 });
    expect(result.warnings).toHaveLength(0);
  });

  it("treats the blank-USN marker (em dash) as no identifier", () => {
    buildPage(row(0, "", "Unregistered Student"));
    const result = discoverEsproStudents(document, mockEsproAdapter);
    expect(result.students[0]!.identifierRaw).toBe("");
    expect(result.students[0]!.identifierNormalized).toBe("");
  });

  it("does not recognize an unrelated page", () => {
    document.body.innerHTML = "<div>Some other page</div>";
    expect(mockEsproAdapter.matchesCurrentPage(document)).toBe(false);
    expect(getActiveAdapter(document)).toBeNull();
  });

  it("15. reports a warning instead of crashing when a row has no mark input (unexpected DOM structure)", () => {
    buildPage(`
      <tr data-row-index="0">
        <td class="col-usn"><span>1DT21CS001</span></td>
        <td class="col-name"><span>Aditi Sharma</span></td>
        <td class="col-marks"><!-- no input here, e.g. a read-only locked field --></td>
      </tr>
    `);
    const result = discoverEsproStudents(document, mockEsproAdapter);
    expect(result.students).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/no mark field/i);
  });

  it("getActiveAdapter finds the mock adapter for the mock page", () => {
    buildPage(row(0, "1DT21CS001", "Aditi Sharma"));
    expect(getActiveAdapter(document)?.id).toBe("mock-espro-v1");
  });
});
