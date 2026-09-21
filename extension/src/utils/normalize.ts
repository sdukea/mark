/** Normalizes an identifier for matching: trim, collapse internal whitespace, uppercase. */
export function normalizeIdentifier(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

/** Normalizes a name for comparison/display: trim, collapse whitespace, title-case-insensitive compare key. */
export function normalizeNameForCompare(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
