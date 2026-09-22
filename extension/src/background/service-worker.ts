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

/** The browser window we shrank to make room for the docked app window, so "Done" can maximize it back. */
const DOCKED_BROWSER_WINDOW_KEY = "dockedBrowserWindowId";

// Unconditional — if this line isn't the first thing in the service
// worker's console after a reload, the new build isn't running yet.
console.log("[Mark] background service worker started", new Date().toISOString());

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  console.log("[Mark] received message", message.type);
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
    case "RESTORE_BROWSER_WINDOW": {
      await restoreBrowserWindow();
      return { type: "OK" };
    }
  }
}

const FALLBACK_APP_WINDOW_WIDTH = 420;
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

  const { left, top, width, height } = await arrangeSideBySide();
  const url = chrome.runtime.getURL("src/popup/index.html") + "?app=1";
  const bounds = { left, top, width, height };
  console.log("[Mark] creating app window", bounds);

  const win = await chrome.windows.create({ url, type: "popup", state: "normal", ...bounds, focused: true });
  console.log("[Mark] window.create result", win && { id: win.id, left: win.left, top: win.top, width: win.width, height: win.height, state: win.state });

  if (win?.id === undefined) return;

  // On some Chrome/OS combinations a popup-type window's requested bounds
  // aren't reliably honored at creation time — the window can paint at a
  // tiny default size regardless of what was requested. An explicit
  // update() immediately after create() is the known-reliable way to force
  // the real size/position to stick.
  const updated = await chrome.windows.update(win.id, { ...bounds, focused: true, state: "normal" });
  console.log("[Mark] window.update result", updated && { left: updated.left, top: updated.top, width: updated.width, height: updated.height, state: updated.state });

  await chrome.storage.session.set({ [APP_WINDOW_KEY]: win.id });
}

const MIN_HALF_WIDTH = 420;

/**
 * Splits the screen between the browser window and the app window,
 * 50/50 — the point being that faculty can look at ESPro on the left and
 * the mark list on the right at equal size while filling. Both windows'
 * combined width equals the browser's original width (so this doesn't
 * assume anything about the physical screen size), split evenly and
 * matching the browser's top and height exactly. Records which browser
 * window got resized so restoreBrowserWindow() can put it back.
 *
 * Falls back to a fixed on-screen position/size if there's no normal
 * browser window to split against, or the browser is already too narrow
 * to halve sensibly.
 */
async function arrangeSideBySide(): Promise<{ left: number; top: number; width: number; height: number }> {
  try {
    const browserWin = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (
      browserWin.id !== undefined &&
      browserWin.left !== undefined &&
      browserWin.top !== undefined &&
      browserWin.width !== undefined &&
      browserWin.height !== undefined
    ) {
      const halfWidth = Math.floor(browserWin.width / 2);
      if (halfWidth >= MIN_HALF_WIDTH) {
        await chrome.windows.update(browserWin.id, {
          left: browserWin.left,
          top: browserWin.top,
          width: halfWidth,
          height: browserWin.height,
        });
        await chrome.storage.session.set({ [DOCKED_BROWSER_WINDOW_KEY]: browserWin.id });
        return {
          left: browserWin.left + halfWidth,
          top: browserWin.top,
          width: browserWin.width - halfWidth, // remainder, so there's no gap from the floor() above
          height: browserWin.height,
        };
      }
      // Too narrow to halve sensibly — dock against its current right edge
      // instead of resizing it.
      return {
        left: Math.max(20, browserWin.left + browserWin.width - 20),
        top: Math.max(60, browserWin.top + 40),
        width: FALLBACK_APP_WINDOW_WIDTH,
        height: APP_WINDOW_HEIGHT,
      };
    }
  } catch {
    // No focused window to split against — fall through to a fixed default.
  }
  return { left: 100, top: 100, width: FALLBACK_APP_WINDOW_WIDTH, height: APP_WINDOW_HEIGHT };
}

/** Undoes the shrink from arrangeSideBySide() by maximizing the browser window back to full size. */
async function restoreBrowserWindow(): Promise<void> {
  const stored = await chrome.storage.session.get(DOCKED_BROWSER_WINDOW_KEY);
  const windowId = stored[DOCKED_BROWSER_WINDOW_KEY] as number | undefined;
  if (windowId === undefined) return;

  try {
    await chrome.windows.update(windowId, { state: "maximized" });
  } catch {
    // The browser window was already closed; nothing to restore.
  }
  await chrome.storage.session.remove(DOCKED_BROWSER_WINDOW_KEY);
}
