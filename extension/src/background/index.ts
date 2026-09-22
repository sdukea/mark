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

/**
 * The toolbar's default_popup is a tiny anchored bubble that Chrome closes
 * the instant it loses focus — which happens immediately if it opens a
 * native file picker, tearing down the whole popup (and the in-flight file
 * selection) before anything can react. So the popup only ever acts as a
 * one-shot launcher: it asks the background to open (or focus) this real,
 * independent window, which behaves like any other browser window and is
 * safe to open native dialogs from.
 */
const APP_WINDOW_KEY = "appWindowId";

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
    case "OPEN_APP_WINDOW": {
      await openOrFocusAppWindow();
      return { type: "OK" };
    }
  }
}

async function openOrFocusAppWindow(): Promise<void> {
  const stored = await chrome.storage.session.get(APP_WINDOW_KEY);
  const existingId = stored[APP_WINDOW_KEY] as number | undefined;

  if (existingId !== undefined) {
    try {
      await chrome.windows.update(existingId, { focused: true });
      return;
    } catch {
      // The stored window was already closed; fall through and open a new one.
    }
  }

  const url = chrome.runtime.getURL("src/popup/index.html") + "?app=1";
  const win = await chrome.windows.create({ url, type: "popup", width: 420, height: 680 });
  if (win?.id !== undefined) {
    await chrome.storage.session.set({ [APP_WINDOW_KEY]: win.id });
  }
}
