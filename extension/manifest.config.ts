import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// NOTE: "matches" currently targets our local mock ESPro instance
// (mock-espro/, served on http://localhost:8765) for development and
// demo purposes. Once we have the real ESPro URL, this gets replaced
// with the actual host pattern — everything else in the extension is
// built against the src/espro/ adapter layer so that swap should not
// require touching matching/parsing/UI code.
const ESPRO_MATCH_PATTERNS = ["http://localhost:8765/*"];

export default defineManifest({
  manifest_version: 3,
  name: "Mark",
  description: "Move marks from your Excel mark list into ESPro — matched, previewed, and verified before anything is written.",
  version: pkg.version,
  action: {
    default_popup: "src/popup/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ESPRO_MATCH_PATTERNS,
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab"],
  host_permissions: ESPRO_MATCH_PATTERNS,
});
