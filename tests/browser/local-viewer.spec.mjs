import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("keeps configuration roots collapsed until selected", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveText(["Kiro", "Claude", "Gemini", "Codex"]);
    await expect(page.locator('.kiro-explorer .tree-directory[aria-expanded="true"]')).toHaveCount(0);
    await expect(page.locator(".kiro-explorer .file-entry")).toHaveCount(0);
    await expect(fileButton(page, "~/.kiro/steering/safe.md.bak")).toHaveCount(0);
    await expect(fileButton(page, "~/.kiro/logs/runtime.log")).toHaveCount(0);
    await expect(page.locator(".preview-placeholder")).toBeVisible();

    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await expect(fileButton(page, "~/.kiro/steering/safe.md")).toBeVisible();
    await fileButton(page, "~/.kiro/steering/safe.md").click();
    await expect(page.locator(".markdown-preview h1")).toHaveText("User Kiro safe");
    await expect(page.locator(".markdown-preview table")).toHaveCount(1);
    await expect(page.locator(".markdown-preview")).toContainText("<script id=\"unsafe\">");
    await expect(page.locator("#unsafe")).toHaveCount(0);
    await expect(page.locator(".markdown-preview a[href^=\"javascript:\"]")).toHaveCount(0);
    await expect(page.locator(".markdown-preview a[target=\"_blank\"]")).toHaveAttribute("rel", "noopener noreferrer");
    const [fileList, preview] = await Promise.all([
        page.locator(".kiro-explorer").boundingBox(),
        page.locator(".file-preview").boundingBox(),
    ]);
    expect(preview.x).toBeGreaterThan(fileList.x + fileList.width);

    await page.getByRole("link", { name: "Skill" }).click();
    await expect(page.locator(".file-preview .preview-name")).toContainText("~/.kiro/skills/example/SKILL.md");
    await page.getByRole("button", { name: "閉じる" }).click();
    await fileButton(page, "~/.kiro/settings.json").click();
    await expect(page.locator(".source-json")).toContainText('"enabled": true');
});

test("shows provider roots and extension-specific source views", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Claude" }).click();
    await openDirectory(page, "~/.claude");
    await openDirectory(page, "rules");
    await expect(fileButton(page, "~/.claude/rules/example.md")).toBeVisible();
    await page.getByRole("tab", { name: "Claude" }).click();
    await openDirectory(page, "~");
    await expect(fileButton(page, "~/CLAUDE.md")).toBeVisible();

    await page.getByRole("tab", { name: "Gemini" }).click();
    await openDirectory(page, "~/.gemini");
    await openDirectory(page, "commands");
    await fileButton(page, "~/.gemini/commands/example.toml").click();
    await expect(page.locator(".source-toml")).toBeVisible();
    await page.getByRole("tab", { name: "Gemini" }).click();
    await openDirectory(page, "~");
    await expect(fileButton(page, "~/GEMINI.md")).toBeVisible();

    await page.getByRole("tab", { name: "Codex" }).click();
    await openDirectory(page, "~/.codex");
    await expect(fileButton(page, "~/.codex/config.toml")).toBeVisible();
});

test("shows protected metadata without rendering protected content", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await fileButton(page, "~/.kiro/db_config.ini").click();
    await expect(page.getByText("機密性のある設定ファイルの本文は表示せず、ファイル情報だけを表示します。")).toBeVisible();
    await expect(page.locator(".file-info")).toContainText("保護");
    await expect(page.locator(".text-preview, .markdown-preview")).toHaveCount(0);
});

test("shows binary metadata without rendering binary content", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await fileButton(page, "~/.kiro/steering/icon.bin").click();
    await expect(page.getByText("バイナリファイルの本文は表示せず、ファイル情報だけを表示します。")).toBeVisible();
    await expect(page.locator(".file-info")).toContainText("バイナリ");
    await expect(page.locator(".text-preview, .markdown-preview")).toHaveCount(0);
});

test("does not render an oversized file", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await fileButton(page, "~/.kiro/steering/oversized.md").click();
    await expect(page.getByText("ファイルが2MiBを超えるため、本文を表示しません。")).toBeVisible();
});

test("shows and copies a user Skill bundle without changing its source", async ({ page }) => {
    const sourceBefore = await readSkillBundle("example");
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "skills");
    await openDirectory(page, "example");
    await fileButton(page, "~/.kiro/skills/example/SKILL.md").click();
    await page.getByRole("button", { name: "移行計画を表示" }).click();
    await expect(page.getByRole("heading", { name: "Skill bundle 移行計画" })).toBeVisible();
    await expect(page.getByText("検出 6件 / 自動更新候補 3件 / 未更新 3件 / 未解決 2件")).toBeVisible();
    await expect(page.getByText("SKILL.md:5 [markdown] https://example.invalid — external (external_reference)")).toBeVisible();
    await expect(page.getByText("SKILL.md:7 [markdown] ../other.md — outside_bundle (parent_traversal)")).toBeVisible();
    await expect(page.getByText("対象: .kiro/skills/example")).toBeVisible();

    await page.getByLabel("宛先名").fill("example-copy");
    await page.getByRole("checkbox", { name: /コピー先が存在する場合は中止されること/ }).check();
    const copyButton = page.getByRole("button", { name: "Skill bundleをコピー" });
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    await expect(page.getByText("Skill bundleをコピーしました: .kiro/skills/example-copy")).toBeVisible();
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "skills");
    await openDirectory(page, "example-copy");
    await expect(fileButton(page, "~/.kiro/skills/example-copy/SKILL.md")).toBeVisible();
    await expect(readSkillBundle("example")).resolves.toEqual(sourceBefore);
    await expect(readSkillBundle("example-copy")).resolves.toEqual(sourceBefore);
});

function fileButton(page, path) {
    return page.locator(`.file-entry[title="${path}"]`);
}

test("keeps focus on tree items and supports arrow key navigation", async ({ page }) => {
    await page.goto("/");
    const root = page.locator('.tree-directory[title="~/.kiro"]');
    await root.focus();
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("aria-expanded", "true");
    await expect(root).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".kiro-explorer [role=treeitem]:focus")).toHaveCount(1);
    await page.keyboard.press("ArrowLeft");
    await expect(root).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("aria-expanded", "false");
});

test("keeps focus on the selected file and returns it after closing the preview", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    const file = fileButton(page, "~/.kiro/steering/safe.md");
    await file.click();
    await expect(file).toHaveAttribute("aria-selected", "true");
    await expect(file).toBeFocused();
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(file).toBeFocused();
});

async function openDirectory(page, name) {
    await page.getByText(name, { exact: true }).click();
}

async function readSkillBundle(name) {
    const bundleRoot = join(process.env.E2E_HOME_ROOT, ".kiro", "skills", name);
    return Promise.all([
        "SKILL.md",
        "references/guide.md",
        "scripts/check.py",
        "assets/icon.txt",
    ].map((relativePath) => readFile(join(bundleRoot, relativePath))));
}
