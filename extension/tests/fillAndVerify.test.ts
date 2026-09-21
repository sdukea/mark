import { describe, expect, it } from "vitest";
import { fillAndVerifyAll, fillAndVerifyOne } from "@/espro/fillAndVerify";
import type { EsproStudent } from "@/types";

function makeStudent(overrides: Partial<EsproStudent> = {}): EsproStudent {
  const input = document.createElement("input");
  input.type = "text";
  document.body.appendChild(input);
  return {
    rowIndex: 0,
    identifierRaw: "1DT21CS001",
    identifierNormalized: "1DT21CS001",
    nameRaw: "Aditi Sharma",
    inputElement: input,
    currentValue: "",
    ...overrides,
  };
}

describe("fillAndVerifyOne", () => {
  it("fills a plain field and verifies it", () => {
    const student = makeStudent();
    const outcome = fillAndVerifyOne(student, "18");
    expect(outcome.status).toBe("VERIFIED");
    expect(outcome.actual).toBe("18");
    expect(student.inputElement.value).toBe("18");
  });

  it("fires native input and change events a framework-bound field would rely on", () => {
    const student = makeStudent();
    const seenEvents: string[] = [];
    let valueAtInputEvent = "";
    student.inputElement.addEventListener("input", (e) => {
      seenEvents.push("input");
      valueAtInputEvent = (e.target as HTMLInputElement).value;
    });
    student.inputElement.addEventListener("change", () => seenEvents.push("change"));

    fillAndVerifyOne(student, "16");

    expect(seenEvents).toEqual(["input", "change"]);
    expect(valueAtInputEvent).toBe("16");
  });

  it("detects a mismatch when the page's own logic alters the value after fill", () => {
    const student = makeStudent();
    student.inputElement.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      el.value = String(Number(el.value) + 1); // simulate the app rewriting the value
    });

    const outcome = fillAndVerifyOne(student, "18");
    expect(outcome.status).toBe("MISMATCH");
    expect(outcome.actual).toBe("19");
  });

  it("detects a failure when the field rejects the value and ends up blank", () => {
    const student = makeStudent();
    student.inputElement.addEventListener("input", (e) => {
      (e.target as HTMLInputElement).value = ""; // simulate rejection
    });

    const outcome = fillAndVerifyOne(student, "18");
    expect(outcome.status).toBe("FAILED");
    expect(outcome.actual).toBe("");
  });
});

describe("fillAndVerifyAll", () => {
  it("processes a batch independently", () => {
    const a = makeStudent({ rowIndex: 0, identifierRaw: "1DT21CS001" });
    const b = makeStudent({ rowIndex: 1, identifierRaw: "1DT21CS002" });
    const outcomes = fillAndVerifyAll([
      { student: a, expected: "18" },
      { student: b, expected: "16" },
    ]);
    expect(outcomes.every((o) => o.status === "VERIFIED")).toBe(true);
    expect(outcomes.map((o) => o.actual)).toEqual(["18", "16"]);
  });
});
