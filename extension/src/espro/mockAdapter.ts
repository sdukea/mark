import type { EsproPageAdapter } from "./adapter";

const BLANK_MARKERS = new Set(["", "—", "-"]);

/** Adapter for our local mock-espro/ demo page. Will be replaced once we have the real ESPro DOM. */
export const mockEsproAdapter: EsproPageAdapter = {
  id: "mock-espro-v1",

  matchesCurrentPage(doc) {
    return doc.getElementById("ctl00_MainContent_gvMarks") !== null;
  },

  findStudentRows(doc) {
    const tbody = doc.getElementById("studentTableBody");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr[data-row-index]"));
  },

  extractIdentifier(row) {
    const cell = row.querySelector(".col-usn");
    const text = cell?.textContent?.trim() ?? "";
    return BLANK_MARKERS.has(text) ? "" : text;
  },

  extractName(row) {
    const cell = row.querySelector(".col-name");
    const text = cell?.textContent?.trim() ?? "";
    return text === "" ? null : text;
  },

  findMarkInput(row) {
    return row.querySelector<HTMLInputElement>("input.marks-input");
  },

  getMaxMarks(doc) {
    const el = doc.getElementById("ctl00_MainContent_lblMaxMarks");
    if (!el) return null;
    const value = Number(el.textContent?.trim());
    return Number.isFinite(value) ? value : null;
  },

  getPaginationInfo(doc) {
    const el = doc.getElementById("pageIndicator");
    const match = el?.textContent?.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
    if (!match) return null;
    return { currentPage: Number(match[1]), totalPages: Number(match[2]) };
  },
};
