import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/fixtures/article.html",
    reuseExistingServer: true,
  },
});
