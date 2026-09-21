import type { BackgroundRequest, BackgroundResponse, ContentRequest, ContentResponse } from "@/types/messages";

export function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

export async function sendToBackground(message: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

export interface ActiveTabInfo {
  tabId: number;
  url: string | null;
}

export async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
