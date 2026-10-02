import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("keeps configuration roots collapsed until selected", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveText(["Kiro", "Claude", "Gemini", "Codex"]);
    await expect(page.locator(".kiro-explorer details[open]")).toHaveCount(0);
    await expect(page.locator(".kiro-explorer .file-entry")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "~/.kiro/steering/safe.md.bak" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "~/.kiro/logs/runtime.log" })).toHaveCount(0);
    await expect(page.locator(".preview-placeholder")).toBeVisible();

    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await expect(page.getByRole("button", { name: "~/.kiro/steering/safe.md" })).toBeVisible();
    await page.getByRole("button", { name: "~/.kiro/steering/safe.md" }).click();
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
    await page.getByRole("button", { name: "選択解除" }).click();
    await page.getByRole("button", { name: "~/.kiro/settings.json" }).click();
    await expect(page.locator(".source-json")).toContainText('"enabled": true');
});

test("shows provider roots and extension-specific source views", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Claude" }).click();
    await openDirectory(page, "~/.claude");
    await openDirectory(page, "rules");
    await expect(page.getByRole("button", { name: "~/.claude/rules/example.md" })).toBeVisible();
    await page.getByRole("tab", { name: "Claude" }).click();
    await openDirectory(page, "~");
    await expect(page.getByRole("button", { name: "~/CLAUDE.md" })).toBeVisible();

    await page.getByRole("tab", { name: "Gemini" }).click();
    await openDirectory(page, "~/.gemini");
    await openDirectory(page, "commands");
    await page.getByRole("button", { name: "~/.gemini/commands/example.toml" }).click();
    await expect(page.locator(".source-toml")).toBeVisible();
    await page.getByRole("tab", { name: "Gemini" }).click();
    await openDirectory(page, "~");
    await expect(page.getByRole("button", { name: "~/GEMINI.md" })).toBeVisible();

    await page.getByRole("tab", { name: "Codex" }).click();
    await openDirectory(page, "~/.codex");
    await expect(page.getByRole("button", { name: "~/.codex/config.toml" })).toBeVisible();
});

test("shows protected metadata without rendering protected content", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await page.getByRole("button", { name: "~/.kiro/db_config.ini" }).click();
    await expect(page.getByText("機密性のある設定ファイルの本文は表示せず、ファイル情報だけを表示します。")).toBeVisible();
    await expect(page.locator(".file-info")).toContainText("protected");
    await expect(page.locator(".text-preview, .markdown-preview")).toHaveCount(0);
});

test("shows binary metadata without rendering binary content", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await page.getByRole("button", { name: "~/.kiro/steering/icon.bin" }).click();
    await expect(page.getByText("バイナリファイルの本文は表示せず、ファイル情報だけを表示します。")).toBeVisible();
    await expect(page.locator(".file-info")).toContainText("binary");
    await expect(page.locator(".text-preview, .markdown-preview")).toHaveCount(0);
});

test("does not render an oversized file", async ({ page }) => {
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "steering");
    await page.getByRole("button", { name: "~/.kiro/steering/oversized.md" }).click();
    await expect(page.getByText("ファイルが2MiBを超えるため、本文を表示しません。")).toBeVisible();
});

test("shows and copies a user Skill bundle without changing its source", async ({ page }) => {
    const sourceBefore = await readSkillBundle("example");
    await page.goto("/");
    await openDirectory(page, "~/.kiro");
    await openDirectory(page, "skills");
    await openDirectory(page, "example");
    await page.getByRole("button", { name: "~/.kiro/skills/example/SKILL.md" }).click();
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
    await expect(page.getByRole("button", { name: "~/.kiro/skills/example-copy/SKILL.md" })).toBeVisible();
    await expect(readSkillBundle("example")).resolves.toEqual(sourceBefore);
    await expect(readSkillBundle("example-copy")).resolves.toEqual(sourceBefore);
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
