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

const APP_WINDOW_WIDTH = 420;
const APP_WINDOW_HEIGHT = 680;

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

  const { left, top } = await computeWindowPosition();
  const url = chrome.runtime.getURL("src/popup/index.html") + "?app=1";
  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    left,
    top,
    focused: true,
  });
  if (win?.id !== undefined) {
    await chrome.storage.session.set({ [APP_WINDOW_KEY]: win.id });
  }
}

/**
 * Chrome's default placement for a new window anchors it near wherever the
 * toolbar icon was clicked. Since that icon sits right at the top edge of
 * the screen, an un-positioned window can end up with most of its height
 * computed above the visible screen — leaving only a tiny sliver on
 * screen. Anchoring explicitly off the current browser window's bounds
 * (with a safe minimum top/left) keeps the whole window on screen.
 */
async function computeWindowPosition(): Promise<{ left: number; top: number }> {
  try {
    const current = await chrome.windows.getCurrent();
    if (current.left !== undefined && current.top !== undefined && current.width !== undefined) {
      return {
        left: Math.max(20, current.left + current.width - APP_WINDOW_WIDTH - 40),
        top: Math.max(60, current.top + 80),
      };
    }
  } catch {
    // No focused window to anchor off — fall through to a fixed default.
  }
  return { left: 100, top: 100 };
}
