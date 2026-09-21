import { beforeEach, describe, expect, it } from "vitest";
import { mockEsproAdapter } from "@/espro/mockAdapter";
import { executeFillPlan } from "@/espro/fillPlan";

function row(index: number, usn: string, name: string): string {
  return `
    <tr data-row-index="${index}">
      <td class="col-usn"><span>${usn}</span></td>
      <td class="col-name"><span>${name}</span></td>
      <td class="col-marks"><input type="text" class="marks-input" value="" /></td>
    </tr>`;
}

function buildPage(rows: string): void {
  document.body.innerHTML = `<table id="ctl00_MainContent_gvMarks"><tbody id="studentTableBody">${rows}</tbody></table>`;
}

describe("executeFillPlan", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fills and verifies a straightforward plan", () => {
    buildPage(row(0, "1DT21CS001", "Aditi Sharma") + row(1, "1DT21CS002", "Rohan Mehta"));
    const outcomes = executeFillPlan(document, mockEsproAdapter, [
      { rowIndex: 0, identifier: "1DT21CS001", value: "18" },
      { rowIndex: 1, identifier: "1DT21CS002", value: "16" },
    ]);
    expect(outcomes.every((o) => o.status === "VERIFIED")).toBe(true);
  });

  it("16. refuses to fill a row whose identifier changed since the preview was built (page changed mid-operation)", () => {
    buildPage(row(0, "1DT21CS001", "Aditi Sharma"));
    // Simulate the page having re-rendered with a different student in this
    // position between preview and fill (e.g. a re-sort, or navigating away
    // and back to a different section).
    document.querySelector(".col-usn span")!.textContent = "1DT21CS999";

    const outcomes = executeFillPlan(document, mockEsproAdapter, [{ rowIndex: 0, identifier: "1DT21CS001", value: "18" }]);
    expect(outcomes[0]!.status).toBe("FAILED");
    expect(document.querySelector<HTMLInputElement>(".marks-input")!.value).toBe("");
  });

  it("skips a planned row that no longer exists on the page", () => {
    buildPage(row(0, "1DT21CS001", "Aditi Sharma"));
    const outcomes = executeFillPlan(document, mockEsproAdapter, [
      { rowIndex: 5, identifier: "1DT21CS999", value: "18" },
    ]);
    expect(outcomes[0]!.status).toBe("SKIPPED");
  });
});
