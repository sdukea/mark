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
  const bounds = { left, top, width: APP_WINDOW_WIDTH, height: APP_WINDOW_HEIGHT };
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

/**
 * Chrome's default placement for a new window anchors it near wherever the
 * toolbar icon was clicked. Since that icon sits right at the top edge of
 * the screen, an un-positioned window can end up with most of its height
 * computed above the visible screen — leaving only a tiny sliver on
 * screen. Anchoring explicitly off the last-focused normal browser
 * window's bounds (with a safe minimum top/left) keeps the whole window
 * on screen. Uses getLastFocused rather than getCurrent since this code
 * runs in the service worker, which has no window of its own to be
 * "current" relative to.
 */
async function computeWindowPosition(): Promise<{ left: number; top: number }> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (win.left !== undefined && win.top !== undefined && win.width !== undefined) {
      return {
        left: Math.max(20, win.left + win.width - APP_WINDOW_WIDTH - 40),
        top: Math.max(60, win.top + 80),
      };
    }
  } catch {
    // No focused window to anchor off — fall through to a fixed default.
  }
  return { left: 100, top: 100 };
}
