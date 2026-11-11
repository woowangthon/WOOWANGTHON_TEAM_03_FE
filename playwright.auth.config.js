import { defineConfig } from "@playwright/test";

// Exercises real FE auth calls against explicit, synthetic browser responses.
// This suite never uses a live account or falls through to the GCP server.
export default defineConfig({
  testDir: "./tests/auth-browser",
  outputDir: "./test-results/auth",
  use: {
    baseURL: "http://127.0.0.1:5184",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev -- --port 5184 --strictPort",
    url: "http://127.0.0.1:5184",
    reuseExistingServer: false,
    env: {
      VITE_AUTH_MODE: "real",
      VITE_REQUEST_MODE: "real",
      DEV_API_TARGET: "",
    },
  },
});
