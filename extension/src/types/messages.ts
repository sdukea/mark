import type { EsproStudentSnapshot, FillOutcome, ParsedWorkbook } from "./index";
import type { FillPlanEntry } from "@/espro/fillPlan";

/** Popup <-> background: background just holds the parsed workbook for the session. */
export type BackgroundRequest =
  | { type: "GET_WORKBOOK" }
  | { type: "SET_WORKBOOK"; workbook: ParsedWorkbook }
  | { type: "CLEAR_WORKBOOK" }
  | { type: "OPEN_APP_WINDOW" };

export type BackgroundResponse =
  | { type: "WORKBOOK"; workbook: ParsedWorkbook | null }
  | { type: "OK" };

/** Popup <-> content script (sent directly via chrome.tabs.sendMessage). */
export type ContentRequest =
  | { type: "PING" }
  | { type: "DETECT_STUDENTS" }
  | { type: "FILL_MARKS"; plan: FillPlanEntry[] };

export type ContentResponse =
  | { type: "PONG"; pageRecognized: boolean; adapterId: string | null }
  | {
      type: "DETECT_RESULT";
      pageRecognized: boolean;
      students: EsproStudentSnapshot[];
      maxMarks: number | null;
      pagination: { currentPage: number; totalPages: number } | null;
      warnings: string[];
    }
  | { type: "FILL_RESULT"; outcomes: FillOutcome[] }
  | { type: "ERROR"; message: string };
