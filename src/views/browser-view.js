export class BrowserView {
    constructor(document) {
        this.document = document;
        this.status = document.querySelector("#status");
        this.catalog = document.querySelector("#catalog");
    }

    setStatus(message, tone = "default") {
        this.status.textContent = message;
        this.status.dataset.tone = tone;
    }

    renderScanning() {
        this.setStatus("現在のユーザーのエージェント設定を確認しています…", "progress");
        this.catalog.replaceChildren();
    }

    renderError() {
        this.setStatus("ローカル設定を取得できませんでした。server.py で起動していることを確認してください。", "error");
        this.renderMessage("設定内容や詳細な例外情報は表示しません。", "notice");
    }

    renderBrowse(browseState, onProviderSelect, onFileSelect, onSelectionClear, onMigrationPlan) {
        const results = browseState.providerResults;
        const selected = results.find((result) => result.providerId === browseState.selectedProviderId) ?? results[0];
        this.setStatus("起動ユーザーのホームにある許可済み設定ディレクトリを表示しています。");
        const tabs = this.document.createElement("div");
        tabs.className = "provider-tabs";
        tabs.setAttribute("role", "tablist");
        for (const result of results) tabs.append(this.createTab(result, selected.providerId, onProviderSelect));
        tabs.addEventListener("keydown", (event) => this.handleTabKey(event, results, selected.providerId, onProviderSelect));
        const panel = this.document.createElement("section");
        panel.className = "provider-panel";
        panel.id = `panel-${selected.providerId}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("tabindex", "0");
        panel.setAttribute("aria-labelledby", `tab-${selected.providerId}`);
        this.renderProvider(panel, selected, browseState.preview, browseState.migrationPlan, onFileSelect, onSelectionClear, onMigrationPlan);
        this.catalog.replaceChildren(tabs, panel);
    }

    createTab(result, selectedProviderId, onProviderSelect) {
        const tab = this.document.createElement("button");
        tab.className = "provider-tab";
        tab.id = `tab-${result.providerId}`;
        tab.type = "button";
        tab.dataset.providerId = result.providerId;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `panel-${result.providerId}`);
        tab.setAttribute("aria-selected", String(result.providerId === selectedProviderId));
        tab.tabIndex = result.providerId === selectedProviderId ? 0 : -1;
        tab.textContent = result.label;
        tab.addEventListener("click", () => onProviderSelect(result.providerId));
        return tab;
    }


    handleTabKey(event, results, selectedProviderId, onProviderSelect) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = results.findIndex((result) => result.providerId === selectedProviderId);
        const next = event.key === "Home" ? 0 : event.key === "End" ? results.length - 1 : (current + (event.key === "ArrowRight" ? 1 : results.length - 1)) % results.length;
        onProviderSelect(results[next].providerId);
        queueMicrotask(() => this.document.querySelector(`#tab-${results[next].providerId}`)?.focus());
    }

    renderProvider(panel, result, preview, migrationPlan, onFileSelect, onSelectionClear, onMigrationPlan) {
        const title = this.document.createElement("h2");
        title.textContent = result.label;
        panel.append(title);
        if (result.status !== "ok") {
            appendText(this.document, panel, providerMessage(result.status), "empty");
            return;
        }
        if (!result.fileEntries.length) {
            appendText(this.document, panel, "対象ファイルはありません。", "empty");
            return;
        }
        const files = this.document.createElement("div");
        files.className = "browse-files";
        const selectedFileId = preview?.fileId ?? null;
        const selectedFile = result.fileEntries.find((entry) => entry.id === selectedFileId) ?? null;
        for (const [name, entries] of groupByCategory(result.fileEntries)) files.append(categorySection(this.document, name, entries, onFileSelect, selectedFileId));
        if (!preview) {
            panel.append(files);
            return;
        }
        const layout = this.document.createElement("div");
        layout.className = "browse-layout";
        layout.append(files, previewSection(this.document, preview, selectedFile, migrationPlan, onSelectionClear, onMigrationPlan));
        panel.append(layout);
    }

    renderMessage(message, className = "empty") {
        const element = this.document.createElement("p");
        element.className = className;
        element.textContent = message;
        this.catalog.replaceChildren(element);
    }
}

function appendText(document, parent, text, className) { const element = document.createElement("p"); element.className = className; element.textContent = text; parent.append(element); }
function providerMessage(status) { return { not_found: "このユーザーのホームには対象ディレクトリがありません。", permission_denied: "対象ディレクトリへのアクセスが許可されませんでした。", list_failed: "対象ディレクトリの一覧を取得できませんでした。" }[status]; }
function groupByCategory(entries) { const groups = new Map(); for (const entry of entries) { const group = groups.get(entry.categoryName) ?? []; group.push(entry); groups.set(entry.categoryName, group); } return groups; }
function categorySection(document, name, entries, onFileSelect, selectedFileId) { const section = document.createElement("div"); section.className = "category"; const title = document.createElement("h3"); title.textContent = name; const list = document.createElement("ul"); for (const entry of entries) { const item = document.createElement("li"); const button = document.createElement("button"); button.className = "file-entry"; button.type = "button"; button.textContent = entry.relativePath; if (entry.id === selectedFileId) { button.classList.add("is-selected"); button.setAttribute("aria-current", "true"); } button.addEventListener("click", () => onFileSelect(entry.id)); item.append(button); list.append(item); } section.append(title, list); return section; }
function previewSection(document, preview, fileEntry, migrationPlan, onSelectionClear, onMigrationPlan) {
    const section = document.createElement("section");
    section.className = "file-preview";
    const header = document.createElement("div");
    header.className = "file-preview-header";
    const title = document.createElement("h3");
    title.textContent = "ファイル本文";
    const actions = document.createElement("div");
    actions.className = "file-preview-actions";
    if (isKiroSkill(fileEntry)) {
        const planButton = document.createElement("button");
        planButton.className = "migration-plan-button";
        planButton.type = "button";
        planButton.disabled = migrationPlan?.status === "planning";
        planButton.textContent = migrationPlan?.status === "planning" ? "移行計画を解析中…" : "移行計画を表示";
        planButton.addEventListener("click", onMigrationPlan);
        actions.append(planButton);
    }
    const clearButton = document.createElement("button");
    clearButton.className = "clear-selection";
    clearButton.type = "button";
    clearButton.textContent = "選択解除";
    clearButton.addEventListener("click", onSelectionClear);
    actions.append(clearButton);
    header.append(title, actions);
    section.append(header);
    if (preview.status === "reading") {
        appendText(document, section, "本文を読込中です…", "empty");
        return section;
    }
    if (preview.status === "error") {
        appendText(document, section, previewMessage(preview.code), "notice");
        return section;
    }
    const name = document.createElement("p");
    name.className = "preview-name";
    name.textContent = preview.displayName;
    const content = document.createElement("pre");
    content.textContent = preview.content;
    section.append(name, content);
    if (migrationPlan) section.append(migrationPlanSection(document, migrationPlan));
    return section;
}

function migrationPlanSection(document, migrationPlan) {
    const section = document.createElement("section");
    section.className = "migration-plan";
    const title = document.createElement("h4");
    title.textContent = "Skill bundle 移行計画";
    section.append(title);
    if (migrationPlan.status === "planning") {
        appendText(document, section, "Skill bundle内の参照を解析しています。ファイルは変更しません。", "empty");
        return section;
    }
    if (migrationPlan.status === "error") {
        appendText(document, section, "移行計画を作成できませんでした。ファイルは変更していません。", "notice");
        return section;
    }
    const { plan } = migrationPlan;
    appendText(document, section, `対象: ${plan.bundlePath}`, "preview-name");
    appendText(document, section, `検出 ${plan.summary.detected}件 / 自動更新候補 ${plan.summary.updatable}件 / 未更新 ${plan.summary.notUpdated}件 / 未解決 ${plan.summary.unresolved}件`, "migration-summary");
    appendPlanEntries(document, section, "参照明細", plan.references, (reference) => `${reference.sourcePath}:${reference.line} [${reference.kind}] ${reference.target} — ${reference.status}${reference.reason ? ` (${reference.reason})` : ""}`);
    appendPlanEntries(document, section, "除外・警告", plan.warnings, (warning) => `${warning.path} — ${warning.reason}`);
    return section;
}

function appendPlanEntries(document, section, heading, entries, formatter) {
    if (!entries.length) return;
    const title = document.createElement("h5");
    title.textContent = heading;
    const list = document.createElement("ul");
    list.className = "migration-plan-entries";
    for (const entry of entries) {
        const item = document.createElement("li");
        item.textContent = formatter(entry);
        list.append(item);
    }
    section.append(title, list);
}

function isKiroSkill(fileEntry) {
    return fileEntry?.providerId === "kiro" && fileEntry.categoryName === "Skills" && fileEntry.displayName === "SKILL.md";
}
function previewMessage(code) { return { too_large: "ファイルが2MiBを超えるため、本文を表示しません。", permission_denied: "ファイルの読取が許可されませんでした。", unsupported_kind: "この形式の本文は表示できません。", read_failed: "ファイル本文を読み取れませんでした。" }[code] ?? "ファイル本文を読み取れませんでした。"; }
