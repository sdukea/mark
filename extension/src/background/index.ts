import type { BackgroundRequest, BackgroundResponse } from "@/types/messages";
import type { ParsedWorkbook } from "@/types";

/**
 * Holds the parsed workbook for the lifetime of the browser session only.
 * chrome.storage.session is in-memory, never written to disk, never synced,
 * and is cleared when the browser closes — deliberately not storage.local,
 * since there is no reason student mark data should persist beyond the
 * current session.
 */
const WORKBOOK_KEY = "parsedWorkbook";

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
  switch (message.type) {
    case "GET_WORKBOOK": {
      const stored = await chrome.storage.session.get(WORKBOOK_KEY);
      const workbook = (stored[WORKBOOK_KEY] as ParsedWorkbook | undefined) ?? null;
      return { type: "WORKBOOK", workbook };
    }
    case "SET_WORKBOOK": {
      await chrome.storage.session.set({ [WORKBOOK_KEY]: message.workbook });
      return { type: "OK" };
    }
    case "CLEAR_WORKBOOK": {
      await chrome.storage.session.remove(WORKBOOK_KEY);
      return { type: "OK" };
    }
  }
}
