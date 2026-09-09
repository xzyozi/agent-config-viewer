import { rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("renders all provider tabs and safe file previews", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveText(["Kiro", "Claude", "Gemini", "Codex"]);
    await expect(page.getByRole("button", { name: ".kiro/steering/ignored.txt" })).toHaveCount(0);
    await expect(page.locator(".file-preview")).toHaveCount(0);
    await page.getByRole("button", { name: ".kiro/steering/safe.md" }).click();
    await expect(page.locator(".file-preview pre")).toContainText("# Kiro safe");
    await expect(page.getByRole("button", { name: ".kiro/steering/safe.md" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: ".kiro/steering/safe.md" })).toHaveClass(/is-selected/);
    await expect(page.locator(".file-preview pre")).toContainText('<script id="unsafe">');
    await expect(page.locator("#unsafe")).toHaveCount(0);
    const [fileList, preview] = await Promise.all([
        page.locator(".browse-files").boundingBox(),
        page.locator(".file-preview").boundingBox(),
    ]);
    expect(preview.x).toBeGreaterThan(fileList.x + fileList.width);
    await page.getByRole("button", { name: "選択解除" }).click();
    await expect(page.locator(".file-preview")).toHaveCount(0);
    await expect(page.locator(".file-entry[aria-current=\"true\"]")).toHaveCount(0);
    await expect(page.locator(".browse-layout")).toHaveCount(0);
    for (const [provider, file] of [["Claude", "CLAUDE.md"], ["Gemini", ".gemini/commands/example.toml"], ["Codex", ".codex/config.toml"]]) {
        await page.getByRole("tab", { name: provider }).click();
        await expect(page.getByRole("button", { name: file })).toBeVisible();
    }
});

test("does not render an oversized file", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: ".kiro/steering/oversized.md" }).click();
    await expect(page.getByText("ファイルが2MiBを超えるため、本文を表示しません。")).toBeVisible();
});

test("keeps an available provider when another provider is absent", async ({ page }) => {
    await rm(join(process.env.E2E_HOME, ".codex"), { recursive: true, force: true });
    await page.goto("/");
    await page.getByRole("tab", { name: "Codex" }).click();
    await expect(page.getByText("このユーザーのホームには対象ディレクトリがありません。")).toBeVisible();
    await page.getByRole("tab", { name: "Kiro" }).click();
    await expect(page.getByRole("button", { name: ".kiro/steering/safe.md" })).toBeVisible();
});
