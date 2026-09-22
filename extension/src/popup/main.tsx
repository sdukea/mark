import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isAppWindowContext, isExtensionContext, openOrFocusAppWindow } from "./messaging";

if (isExtensionContext() && !isAppWindowContext()) {
  // This is the tiny toolbar launcher popup. It never renders its own UI —
  // it just asks the background to open (or focus) the real app window and
  // lets Chrome close it naturally once that window takes focus.
  openOrFocusAppWindow();
} else {
  const root = document.getElementById("root");
  if (!root) throw new Error("Popup root element not found.");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
