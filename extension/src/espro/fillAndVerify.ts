import type { EsproStudent, FillOutcome } from "@/types";

type FillableElement = HTMLInputElement | HTMLSelectElement;

/**
 * Sets a form field's value the way a real user action would be recognized
 * by a modern JS framework. Plain `element.value = x` does not notify
 * React's internal tracker (it patches the native setter), so frameworks
 * relying on the native `input`/`change` event never see the change. This
 * calls the native setter directly, then fires the same events a user
 * interaction would — no keystrokes or focus/blur are faked, since nothing
 * in scope here (no auto-submit) depends on them.
 */
function setNativeValue(element: FillableElement, value: string): void {
  const proto = element instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fills one field and immediately reads it back to confirm what actually landed. */
export function fillAndVerifyOne(student: EsproStudent, expected: string): FillOutcome {
  setNativeValue(student.inputElement, expected);
  const actual = student.inputElement.value;

  let status: FillOutcome["status"];
  if (actual.trim() === "") {
    status = "FAILED";
  } else if (Number(actual) === Number(expected) && actual.trim() !== "") {
    status = "VERIFIED";
  } else {
    status = "MISMATCH";
  }

  return {
    rowIndex: student.rowIndex,
    identifier: student.identifierRaw,
    expected,
    actual,
    status,
  };
}

export function fillAndVerifyAll(entries: Array<{ student: EsproStudent; expected: string }>): FillOutcome[] {
  return entries.map(({ student, expected }) => fillAndVerifyOne(student, expected));
}
