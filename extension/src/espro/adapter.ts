/**
 * An EsproPageAdapter is the ONLY place that knows about a specific ESPro
 * page's actual DOM structure. Everything else in the extension (matching,
 * validation, UI) works against the normalized EsproStudent[] this produces
 * and never touches selectors directly.
 *
 * This lets us build and test the whole extension against the mock page
 * now, then swap in a new adapter for the real ESPro DOM later without
 * touching anything upstream of it.
 */
export interface EsproPageAdapter {
  /** Human-readable name, surfaced in diagnostics. */
  readonly id: string;

  /** Whether this adapter recognizes the current page at all. */
  matchesCurrentPage(doc: Document): boolean;

  /** One row per student control currently rendered (i.e. on the visible page only). */
  findStudentRows(doc: Document): Element[];

  extractIdentifier(row: Element): string;

  extractName(row: Element): string | null;

  findMarkInput(row: Element): HTMLInputElement | HTMLSelectElement | null;

  /** Maximum allowed mark for this page, if determinable from the DOM. */
  getMaxMarks(doc: Document): number | null;

  /** Pagination state, if this page is paginated. Null if it isn't (or can't be determined). */
  getPaginationInfo(doc: Document): { currentPage: number; totalPages: number } | null;
}
