import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Separate from vite.config.ts: the crx plugin there is for building the
// extension bundle and doesn't belong in the test environment.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
