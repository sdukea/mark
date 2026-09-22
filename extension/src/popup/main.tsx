import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isAppWindowContext, isExtensionContext, openOrFocusAppWindow } from "./messaging";

if (isExtensionContext() && !isAppWindowContext()) {
  // This is the tiny toolbar launcher popup. It never renders its own UI —
  // it just asks the background to open (or focus) the real app window.
  // Closing it explicitly rather than counting on Chrome's close-on-blur:
  // that didn't reliably happen once the app window started actively
  // moving/resizing the browser window rather than just opening quietly,
  // leaving this one behind as a blank rectangle near the toolbar icon.
  void openOrFocusAppWindow();
  window.close();
} else {
  const root = document.getElementById("root");
  if (!root) throw new Error("Popup root element not found.");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
