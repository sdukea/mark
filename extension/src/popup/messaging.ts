import type { BackgroundRequest, BackgroundResponse, ContentRequest, ContentResponse } from "@/types/messages";

export function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

/** True when this page is the real, independent app window (as opposed to the tiny toolbar launcher popup). */
export function isAppWindowContext(): boolean {
  return new URLSearchParams(window.location.search).get("app") === "1";
}

export async function sendToBackground(message: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

/** Asks the background to open (or focus) the app window. Only ever called from the launcher popup. */
export async function openOrFocusAppWindow(): Promise<void> {
  await sendToBackground({ type: "OPEN_APP_WINDOW" });
}

export interface ActiveTabInfo {
  tabId: number;
  url: string | null;
}

/**
 * Finds the active tab in the user's browser window — NOT "the current
 * window" relative to this script, since this script now runs inside our
 * own separate app window (type "popup"), not anchored to the browser
 * window the way the old default_popup was. windowTypes: ["normal"]
 * deliberately excludes our own app window from consideration.
 */
export async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"], populate: true });
  const tab = win.tabs?.find((t) => t.active);
  if (!tab?.id) return null;
  return { tabId: tab.id, url: tab.url ?? null };
}

/** Errors thrown here mean "no content script is listening on this tab" (e.g. not an ESPro page, or it was reloaded). */
export async function sendToContent(tabId: number, message: ContentRequest): Promise<ContentResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response) {
      return { type: "ERROR", message: "The ESPro page did not respond. Try reloading it and checking again." };
    }
    return response as ContentResponse;
  } catch {
    return {
      type: "ERROR",
      message: "Could not reach this tab's content script. Make sure you're on the ESPro marks page and reload it if you just navigated there.",
    };
  }
}
