export interface MarkValidationResult {
  valid: boolean;
  /** Parsed numeric mark, only present when valid. */
  value: number | null;
  reason: string | null;
}

/**
 * Validates a raw mark cell value. A mark is only ever considered valid when
 * it is a plain number within [0, maxMarks] (when maxMarks is known). Text,
 * blanks, and out-of-range values are all rejected rather than coerced.
 */
export function validateMark(raw: string | number | null, maxMarks: number | null): MarkValidationResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { valid: false, value: null, reason: "Mark is blank." };
  }

  const asString = String(raw).trim();
  const asNumber = Number(asString);

  if (!Number.isFinite(asNumber)) {
    return { valid: false, value: null, reason: `"${asString}" is not a number.` };
  }
  if (asNumber < 0) {
    return { valid: false, value: null, reason: `${asNumber} is negative.` };
  }
  if (maxMarks !== null && asNumber > maxMarks) {
    return { valid: false, value: null, reason: `${asNumber} exceeds the maximum of ${maxMarks}.` };
  }

  return { valid: true, value: asNumber, reason: null };
}
