import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    timeout: 30_000,
    workers: 1,
    reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
    outputDir: "test-results",
    use: {
        baseURL: process.env.LOCAL_VIEWER_URL ?? "http://127.0.0.1:8765",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
});
