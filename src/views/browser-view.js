import { renderMarkdown } from "./markdown-renderer.js";

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
        this.setStatus("対応するProviderの設定構成を確認しています…", "progress");
        this.catalog.replaceChildren();
    }

    renderError() {
        this.setStatus("設定構成を取得できませんでした。server.py で起動していることを確認してください。", "error");
        this.renderMessage("設定内容や詳細な例外情報は表示しません。", "notice");
    }

    renderBrowse(browseState, onProviderSelect, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh) {
        const results = browseState.providerResults;
        const selected = results.find((result) => result.providerId === browseState.selectedProviderId) ?? results[0];
        if (!selected) {
            this.renderMessage("表示対象のKiro構成がありません。", "empty");
            return;
        }
        this.setStatus("対応するProviderの設定構成を表示しています。");
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
        this.renderProvider(panel, selected, browseState.preview, browseState.migrationPlan, browseState.migrationCopy, browseState.copyResult, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh);
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

    renderProvider(panel, result, preview, migrationPlan, migrationCopy, copyResult, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh) {
        const heading = this.document.createElement("div");
        heading.className = "provider-heading";
        const title = this.document.createElement("div");
        const eyebrow = this.document.createElement("p");
        eyebrow.className = "provider-eyebrow";
        eyebrow.textContent = `${result.label} configuration`;
        const headingTitle = this.document.createElement("h2");
        headingTitle.textContent = result.label;
        title.append(eyebrow, headingTitle);
        const refreshButton = this.document.createElement("button");
        refreshButton.className = "refresh-button";
        refreshButton.type = "button";
        refreshButton.textContent = "更新";
        refreshButton.title = ".kiroの構成を再読み込み";
        refreshButton.addEventListener("click", () => onRefresh?.());
        heading.append(title, refreshButton);
        panel.append(heading);
        if (result.providerId === "kiro" && copyResult?.status === "copied") panel.append(copyResultSection(this.document, copyResult));
        if (result.status !== "ok") {
            appendText(this.document, panel, providerMessage(result.status, result.label), "empty");
            return;
        }
        const layout = this.document.createElement("div");
        layout.className = "browse-layout";
        layout.append(
            treeSection(this.document, result.tree, result.fileEntries, preview?.fileId ?? null, onFileSelect),
            previewSection(this.document, preview, result.fileEntries.find((entry) => entry.id === preview?.fileId) ?? null, result.fileEntries, migrationPlan, migrationCopy, onSelectionClear, onMigrationPlan, onCopySkillBundle, onFileSelect),
        );
        panel.append(layout);
    }

    renderMessage(message, className = "empty") {
        const element = this.document.createElement("p");
        element.className = className;
        element.textContent = message;
        this.catalog.replaceChildren(element);
    }
}

function treeSection(document, tree, fileEntries, selectedFileId, onFileSelect) {
    const section = document.createElement("aside");
    section.className = "kiro-explorer";
    section.setAttribute("aria-label", "設定構成エクスプローラー");
    const header = document.createElement("div");
    header.className = "explorer-header";
    const title = document.createElement("h3");
    title.textContent = "Explorer";
    const count = document.createElement("span");
    count.className = "explorer-count";
    count.textContent = `${fileEntries.length} files`;
    header.append(title, count);
    section.append(header);
    if (!tree) {
        appendText(document, section, "対象の .kiro はありません。", "empty");
        return section;
    }
    const rootList = document.createElement("ul");
    rootList.className = "kiro-tree";
    rootList.append(treeNode(document, tree, selectedFileId, onFileSelect, true));
    section.append(rootList);
    return section;
}

function treeNode(document, node, selectedFileId, onFileSelect, isRoot = false) {
    const item = document.createElement("li");
    item.className = `tree-node tree-node-${node.type}`;
    if (node.type === "directory") {
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.className = "tree-directory";
        summary.textContent = node.name;
        summary.title = node.relativePath;
        details.append(summary);
        const children = document.createElement("ul");
        children.className = "tree-children";
        for (const child of node.children ?? []) children.append(treeNode(document, child, selectedFileId, onFileSelect));
        details.append(children);
        item.append(details);
        return item;
    }
    const button = document.createElement("button");
    button.className = "file-entry";
    button.type = "button";
    button.setAttribute("aria-label", node.relativePath);
    button.title = node.relativePath;
    button.dataset.kind = node.kind;
    if (node.fileId === selectedFileId) {
        button.classList.add("is-selected");
        button.setAttribute("aria-current", "true");
    }
    if (!node.readable) button.classList.add("is-unreadable");
    const name = document.createElement("span");
    name.className = "tree-file-name";
    name.textContent = node.name;
    const kind = document.createElement("span");
    kind.className = "tree-file-kind";
    kind.textContent = node.readable ? fileKindLabel(node.kind) : "info";
    button.append(name, kind);
    button.addEventListener("click", () => onFileSelect(node.fileId));
    item.append(button);
    return item;
}

function previewSection(document, preview, fileEntry, fileEntries, migrationPlan, migrationCopy, onSelectionClear, onMigrationPlan, onCopySkillBundle, onFileSelect) {
    const section = document.createElement("section");
    section.className = "file-preview";
    const header = document.createElement("div");
    header.className = "file-preview-header";
    const title = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = fileEntry?.kind === "markdown" ? "Markdown Preview" : "Preview";
    title.append(heading);
    if (fileEntry) {
        const path = document.createElement("p");
        path.className = "preview-name";
        path.textContent = fileEntry.relativePath;
        title.append(path);
    }
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
    if (fileEntry) {
        const clearButton = document.createElement("button");
        clearButton.className = "clear-selection";
        clearButton.type = "button";
        clearButton.textContent = "選択解除";
        clearButton.addEventListener("click", onSelectionClear);
        actions.append(clearButton);
    }
    header.append(title, actions);
    section.append(header);
    if (!fileEntry) {
        appendText(document, section, "左のExplorerからファイルを選択してください。", "preview-placeholder");
        return section;
    }
    section.append(fileInfo(document, fileEntry));
    if (!preview || preview.status === "reading") {
        if (preview?.status === "reading") appendText(document, section, "本文を読込中です…", "empty");
        else appendText(document, section, "プレビューするファイルを選択してください。", "preview-placeholder");
        return section;
    }
    if (preview.status === "error") {
        appendText(document, section, previewMessage(preview.code), "notice");
        return section;
    }
    if (fileEntry.kind === "markdown") {
        const markdown = document.createElement("article");
        markdown.className = "markdown-preview";
        renderMarkdown(document, markdown, preview.content, { currentPath: fileEntry.relativePath, fileEntries, onFileSelect });
        section.append(markdown);
    } else {
        const content = document.createElement("pre");
        content.className = "text-preview";
        content.textContent = preview.content;
        section.append(content);
    }
    if (migrationPlan) section.append(migrationPlanSection(document, migrationPlan, migrationCopy, onCopySkillBundle));
    return section;
}

function fileInfo(document, fileEntry) {
    const info = document.createElement("p");
    info.className = "file-info";
    info.textContent = `${fileKindLabel(fileEntry.kind)} · ${formatBytes(fileEntry.sizeBytes)}`;
    return info;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes ?? 0} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function fileKindLabel(kind) {
    return { binary: "binary", css: "CSS", html: "HTML", javascript: "JavaScript", json: "JSON", markdown: "Markdown", python: "Python", sensitive: "protected", shell: "Shell", text: "Text", toml: "TOML", yaml: "YAML" }[kind] ?? "File";
}

function migrationPlanSection(document, migrationPlan, migrationCopy, onCopySkillBundle) {
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
    section.append(migrationCopyControls(document, migrationCopy, onCopySkillBundle));
    return section;
}

function migrationCopyControls(document, migrationCopy, onCopySkillBundle) {
    const controls = document.createElement("div");
    controls.className = "migration-copy-controls";
    const heading = document.createElement("h5");
    heading.textContent = "同一Provider内へコピー";
    const help = document.createElement("p");
    help.className = "migration-copy-help";
    help.textContent = "同じ .kiro/skills 直下へ、既存のbundleを上書きせずコピーします。元のbundleは変更しません。";
    const label = document.createElement("label");
    label.htmlFor = "migration-copy-destination";
    label.textContent = "宛先名";
    const destination = document.createElement("input");
    destination.className = "migration-copy-destination";
    destination.id = "migration-copy-destination";
    destination.type = "text";
    destination.maxLength = 128;
    destination.autocomplete = "off";
    destination.value = migrationCopy?.destinationName ?? "";
    destination.disabled = migrationCopy?.status === "copying";
    const confirmation = document.createElement("label");
    confirmation.className = "migration-copy-confirmation";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = migrationCopy?.status === "copying";
    checkbox.disabled = migrationCopy?.status === "copying";
    const confirmationText = document.createElement("span");
    confirmationText.textContent = "コピー先が存在する場合は中止されること、元のbundleを変更しないことを確認しました。";
    confirmation.append(checkbox, confirmationText);
    const copyButton = document.createElement("button");
    copyButton.className = "migration-copy-button";
    copyButton.type = "button";
    copyButton.textContent = migrationCopy?.status === "copying" ? "コピー中…" : "Skill bundleをコピー";
    const updateCopyButton = () => {
        copyButton.disabled = migrationCopy?.status === "copying" || !checkbox.checked || !isDestinationName(destination.value);
    };
    destination.addEventListener("input", updateCopyButton);
    checkbox.addEventListener("change", updateCopyButton);
    copyButton.addEventListener("click", () => onCopySkillBundle(destination.value, checkbox.checked));
    updateCopyButton();
    controls.append(heading, help, label, destination, confirmation, copyButton);
    if (migrationCopy?.status === "error") appendText(document, controls, migrationCopyMessage(migrationCopy.code), "notice");
    return controls;
}

function copyResultSection(document, copyResult) {
    const result = document.createElement("p");
    result.className = "migration-copy-result";
    result.setAttribute("role", "status");
    result.textContent = `Skill bundleをコピーしました: ${copyResult.bundlePath}`;
    return result;
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

function appendText(document, parent, text, className) {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = text;
    parent.append(element);
}

function providerMessage(status, label) { return { not_found: `${label}の設定ディレクトリはありません。`, permission_denied: `${label}の設定ディレクトリへのアクセスが許可されませんでした。`, list_failed: `${label}の設定一覧を取得できませんでした。` }[status] ?? `${label}の設定一覧を取得できませんでした。`; }
function isKiroSkill(fileEntry) {
    if (!fileEntry?.readable || fileEntry?.providerId !== "kiro") return false;
    const parts = fileEntry.relativePath.toLowerCase().split("/");
    const rootIndex = parts[0] === "~" && parts[1] === ".kiro" ? 2 : 0;
    return parts.length === rootIndex + 4 && parts[rootIndex] === ".kiro" && parts[rootIndex + 1] === "skills" && parts[rootIndex + 3] === "skill.md";
}
function previewMessage(code) { return { binary: "バイナリファイルの本文は表示せず、ファイル情報だけを表示します。", sensitive: "機密性のある設定ファイルの本文は表示せず、ファイル情報だけを表示します。", too_large: "ファイルが2MiBを超えるため、本文を表示しません。", permission_denied: "ファイルの読取が許可されませんでした。", unsupported_kind: "この形式の本文は表示できません。", read_failed: "ファイル本文を読み取れませんでした。" }[code] ?? "ファイル本文を読み取れませんでした。"; }
function isDestinationName(destinationName) { const reservedNames = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)]); return typeof destinationName === "string" && Boolean(destinationName) && destinationName === destinationName.trim() && destinationName.length <= 128 && ![".", ".."].includes(destinationName) && !destinationName.toLowerCase().startsWith(".skill-copy-") && !reservedNames.has(destinationName.toLowerCase()) && !destinationName.endsWith(".") && !/[\\/:<>"|?*\0\x00-\x1f]/.test(destinationName); }
function migrationCopyMessage(code) { return { stale_plan: "表示しているSkill bundleの内容が変わったため、コピーを実行しませんでした。移行計画を再取得してください。", destination_conflict: "指定した宛先はすでに存在するため、コピーを実行しませんでした。別の宛先名を指定してください。", read_failed: "Skill bundleを安全に再確認できなかったため、コピーを実行しませんでした。", copy_failed: "Skill bundleをコピーできませんでした。元のbundleは変更していません。" }[code] ?? "Skill bundleをコピーできませんでした。元のbundleは変更していません。"; }
