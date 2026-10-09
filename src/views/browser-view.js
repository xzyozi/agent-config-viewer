import { renderMarkdown } from "./markdown-renderer.js";

export class BrowserView {
    constructor(document) {
        this.document = document;
        this.status = document.querySelector("#status");
        this.catalog = document.querySelector("#catalog");
        this.lastProviderId = null;
        this.lastPreviewFileId = null;
        this.lastCopyResult = null;
    }

    setStatus(message, tone = "default") {
        this.status.textContent = message;
        this.status.dataset.tone = tone;
        this.status.setAttribute("role", tone === "error" ? "alert" : "status");
    }

    // 再スキャン中は既存の表示を残し、進捗だけを示す（選択の文脈を失わせない）
    renderScanning() {
        this.setStatus("対応するProviderの設定構成を確認しています…", "progress");
        this.catalog.setAttribute("aria-busy", "true");
    }

    renderError() {
        this.setStatus("設定構成を取得できませんでした。server.py で起動していることを確認してください。", "error");
        this.renderMessage("設定内容や詳細な例外情報は表示しません。", "notice");
    }

    renderBrowse(browseState, onProviderSelect, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh, onDirectoryToggle, onResolveLink) {
        const results = browseState.providerResults;
        const selected = results.find((result) => result.providerId === browseState.selectedProviderId) ?? results[0];
        if (!selected) {
            this.renderMessage("表示対象のKiro構成がありません。", "empty");
            return;
        }
        const uiState = this.captureUiState();
        this.catalog.removeAttribute("aria-busy");
        if (browseState.directoryLoadingKey) this.setStatus("フォルダを読込中です…", "progress");
        else if (browseState.preview?.status === "reading") this.setStatus("本文を読込中です…", "progress");
        else this.setStatus("対応するProviderの設定構成を表示しています。");
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
        this.renderProvider(panel, selected, browseState.preview, browseState.migrationPlan, browseState.migrationCopy, browseState.copyResult, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh, onDirectoryToggle, onResolveLink, browseState.directoryLoadingKey, browseState.directoryErrorKey);
        this.catalog.replaceChildren(tabs, panel);
        this.restoreUiState(uiState, browseState, selected.providerId);
    }

    // 再描画前にフォーカス・スクロール・入力値を退避する
    captureUiState() {
        const active = this.document.activeElement;
        const destination = this.catalog.querySelector("#migration-copy-destination");
        const confirmation = this.catalog.querySelector(".migration-copy-confirmation input");
        const view = this.document.defaultView;
        return {
            focusKey: active && this.catalog.contains(active) ? active.dataset.focusKey ?? null : null,
            selection: destination && active === destination ? [destination.selectionStart, destination.selectionEnd] : null,
            explorerScroll: this.catalog.querySelector(".kiro-explorer")?.scrollTop ?? 0,
            previewScroll: this.catalog.querySelector(".file-preview")?.scrollTop ?? 0,
            windowScroll: [view?.scrollX ?? 0, view?.scrollY ?? 0],
            destination: destination?.value ?? null,
            confirmed: confirmation?.checked ?? false,
        };
    }

    restoreUiState(uiState, browseState, providerId) {
        const fileId = browseState.preview?.fileId ?? null;
        const sameProvider = this.lastProviderId === providerId;
        const sameFile = sameProvider && this.lastPreviewFileId === fileId;
        const previousFileId = this.lastPreviewFileId;
        const explorer = this.catalog.querySelector(".kiro-explorer");
        const preview = this.catalog.querySelector(".file-preview");
        if (sameProvider && explorer) explorer.scrollTop = uiState.explorerScroll;
        if (sameFile && preview) preview.scrollTop = uiState.previewScroll;
        if (sameFile && uiState.destination !== null) {
            const destination = this.catalog.querySelector("#migration-copy-destination");
            const confirmation = this.catalog.querySelector(".migration-copy-confirmation input");
            if (destination && !destination.disabled) {
                destination.value = uiState.destination;
                if (confirmation) confirmation.checked = uiState.confirmed;
                destination.dispatchEvent(new Event("input"));
            }
        }
        const rovingKey = uiState.focusKey?.startsWith("dir:") || uiState.focusKey?.startsWith("file:") ? uiState.focusKey : null;
        applyRovingTabindex(this.catalog.querySelector(".kiro-tree"), rovingKey ?? (fileId ? `file:${fileId}` : null));
        this.restoreFocus(uiState, previousFileId);
        const view = this.document.defaultView;
        if (view && uiState.windowScroll[1] !== view.scrollY) view.scrollTo(uiState.windowScroll[0], uiState.windowScroll[1]);
        const copyNotice = this.catalog.querySelector(".migration-copy-result");
        if (copyNotice && browseState.copyResult !== this.lastCopyResult) copyNotice.focus();
        else if (fileId && fileId !== this.lastPreviewFileId && view?.matchMedia?.("(max-width: 800px)").matches) {
            preview?.scrollIntoView({ block: "start" });
        }
        this.lastProviderId = providerId;
        this.lastPreviewFileId = fileId;
        this.lastCopyResult = browseState.copyResult ?? null;
    }

    restoreFocus(uiState, previousFileId) {
        if (!uiState.focusKey) return;
        const find = (key) => this.catalog.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
        const target = find(uiState.focusKey) ?? (previousFileId ? find(`file:${previousFileId}`) : null);
        if (!target || target.disabled) return;
        target.focus({ preventScroll: true });
        if (uiState.selection && target.setSelectionRange) target.setSelectionRange(...uiState.selection);
    }

    createTab(result, selectedProviderId, onProviderSelect) {
        const tab = this.document.createElement("button");
        tab.className = "provider-tab";
        tab.id = `tab-${result.providerId}`;
        tab.type = "button";
        tab.dataset.providerId = result.providerId;
        tab.dataset.focusKey = `tab:${result.providerId}`;
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

    renderProvider(panel, result, preview, migrationPlan, migrationCopy, copyResult, onFileSelect, onSelectionClear, onMigrationPlan, onCopySkillBundle, onRefresh, onDirectoryToggle, onResolveLink, directoryLoadingKey, directoryErrorKey) {
        const heading = this.document.createElement("div");
        heading.className = "provider-heading";
        const title = this.document.createElement("div");
        const eyebrow = this.document.createElement("p");
        eyebrow.className = "provider-eyebrow";
        eyebrow.textContent = `${result.label} 設定`;
        const headingTitle = this.document.createElement("h2");
        headingTitle.textContent = result.label;
        title.append(eyebrow, headingTitle);
        const refreshButton = this.document.createElement("button");
        refreshButton.className = "refresh-button";
        refreshButton.type = "button";
        refreshButton.dataset.focusKey = "action:refresh";
        refreshButton.textContent = "更新";
        refreshButton.title = "設定構成を再読み込み";
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
            treeSection(this.document, result.tree, result.fileEntries, preview?.fileId ?? null, onFileSelect, onDirectoryToggle, directoryLoadingKey, directoryErrorKey),
            previewSection(this.document, preview, result.fileEntries.find((entry) => entry.id === preview?.fileId) ?? null, result.fileEntries, migrationPlan, migrationCopy, onSelectionClear, onMigrationPlan, onCopySkillBundle, onFileSelect, onResolveLink),
        );
        panel.append(layout);
    }

    renderMessage(message, className = "empty") {
        const element = this.document.createElement("p");
        element.className = className;
        element.textContent = message;
        this.catalog.removeAttribute("aria-busy");
        this.catalog.replaceChildren(element);
    }
}

function treeSection(document, tree, fileEntries, selectedFileId, onFileSelect, onDirectoryToggle, directoryLoadingKey, directoryErrorKey) {
    const section = document.createElement("aside");
    section.className = "kiro-explorer";
    section.setAttribute("aria-label", "設定構成エクスプローラー");
    const header = document.createElement("div");
    header.className = "explorer-header";
    const title = document.createElement("h3");
    title.textContent = "エクスプローラー";
    const count = document.createElement("span");
    count.className = "explorer-count";
    count.textContent = `${fileEntries.length} 件`;
    header.append(title, count);
    section.append(header);
    if (!tree) {
        appendText(document, section, "対象の設定rootはありません。", "empty");
        return section;
    }
    const rootList = document.createElement("ul");
    rootList.className = "kiro-tree";
    rootList.setAttribute("role", "tree");
    rootList.setAttribute("aria-label", "設定ファイル");
    if (directoryLoadingKey) rootList.setAttribute("aria-busy", "true");
    rootList.addEventListener("keydown", handleTreeKey);
    for (const child of tree.children ?? []) rootList.append(treeNode(document, child, selectedFileId, onFileSelect, onDirectoryToggle, directoryLoadingKey, directoryErrorKey));
    section.append(rootList);
    return section;
}

function treeNode(document, node, selectedFileId, onFileSelect, onDirectoryToggle, directoryLoadingKey, directoryErrorKey) {
    const item = document.createElement("li");
    item.className = `tree-node tree-node-${node.type}`;
    item.setAttribute("role", "none");
    if (node.type === "directory") {
        const directoryKey = directoryKeyOf(node);
        const button = document.createElement("button");
        button.className = "tree-directory";
        button.type = "button";
        button.setAttribute("role", "treeitem");
        button.setAttribute("aria-expanded", String(Boolean(node.open)));
        button.title = node.relativePath;
        button.tabIndex = -1;
        button.dataset.treeItem = "";
        button.dataset.treeType = "directory";
        button.dataset.focusKey = `dir:${directoryKey}`;
        const name = document.createElement("span");
        name.className = "tree-directory-name";
        name.textContent = node.name;
        button.append(name);
        button.addEventListener("click", () => onDirectoryToggle(node));
        if (directoryKey === directoryLoadingKey) appendDirectoryState(document, button, "読込中…");
        if (directoryKey === directoryErrorKey) appendDirectoryState(document, button, "読込失敗");
        item.append(button);
        const children = document.createElement("ul");
        children.className = "tree-children";
        children.setAttribute("role", "group");
        children.hidden = !node.open;
        for (const child of node.children ?? []) children.append(treeNode(document, child, selectedFileId, onFileSelect, onDirectoryToggle, directoryLoadingKey, directoryErrorKey));
        item.append(children);
        return item;
    }
    const button = document.createElement("button");
    button.className = "file-entry";
    button.type = "button";
    button.setAttribute("role", "treeitem");
    button.title = node.relativePath;
    button.tabIndex = -1;
    button.dataset.kind = node.kind;
    button.dataset.treeItem = "";
    button.dataset.treeType = "file";
    button.dataset.focusKey = `file:${node.fileId}`;
    button.setAttribute("aria-selected", String(node.fileId === selectedFileId));
    if (node.fileId === selectedFileId) button.classList.add("is-selected");
    if (!node.readable) button.classList.add("is-unreadable");
    const name = document.createElement("span");
    name.className = "tree-file-name";
    name.textContent = node.name;
    const kind = document.createElement("span");
    kind.className = "tree-file-kind";
    kind.textContent = node.readable ? fileKindLabel(node.kind) : "閲覧不可";
    button.append(name, kind);
    button.addEventListener("click", () => onFileSelect(node.fileId));
    item.append(button);
    return item;
}

function appendDirectoryState(document, parent, text) {
    const state = document.createElement("span");
    state.className = "tree-directory-state";
    state.textContent = text;
    parent.append(state);
}

function directoryKeyOf(node) {
    return node?.directoryId ?? node?.relativePath ?? null;
}

// 展開されているノードだけを表示順に返す
function visibleTreeItems(tree) {
    return [...tree.querySelectorAll("[data-tree-item]")].filter((item) => !item.closest("[hidden]"));
}

// roving tabindex: ツリー内でTab停止位置を常に1つだけにする
function applyRovingTabindex(tree, preferredKey) {
    if (!tree) return;
    const items = visibleTreeItems(tree);
    const target = items.find((item) => item.dataset.focusKey === preferredKey) ?? items[0];
    for (const item of items) item.tabIndex = item === target ? 0 : -1;
}

function moveTreeFocus(tree, target) {
    applyRovingTabindex(tree, target.dataset.focusKey);
    target.focus();
}

function handleTreeKey(event) {
    const current = event.target.closest?.("[data-tree-item]");
    if (!current) return;
    const tree = event.currentTarget;
    const items = visibleTreeItems(tree);
    const index = items.indexOf(current);
    const isDirectory = current.dataset.treeType === "directory";
    const expanded = current.getAttribute("aria-expanded") === "true";
    let target = null;
    if (event.key === "ArrowDown") target = items[index + 1];
    else if (event.key === "ArrowUp") target = items[index - 1];
    else if (event.key === "Home") target = items[0];
    else if (event.key === "End") target = items.at(-1);
    else if (event.key === "ArrowRight" && isDirectory) {
        if (!expanded) current.click();
        else target = current.parentElement.querySelector(":scope > ul [data-tree-item]");
    } else if (event.key === "ArrowLeft") {
        if (isDirectory && expanded) current.click();
        else target = current.closest("ul[role=group]")?.parentElement.querySelector(":scope > [data-tree-item]");
    } else return;
    event.preventDefault();
    if (target) moveTreeFocus(tree, target);
}

function previewSection(document, preview, fileEntry, fileEntries, migrationPlan, migrationCopy, onSelectionClear, onMigrationPlan, onCopySkillBundle, onFileSelect, onResolveLink) {
    const section = document.createElement("section");
    section.className = "file-preview";
    const header = document.createElement("div");
    header.className = "file-preview-header";
    const title = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = fileEntry?.kind === "markdown" ? "Markdownプレビュー" : "プレビュー";
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
        planButton.dataset.focusKey = "action:plan";
        planButton.disabled = migrationPlan?.status === "planning";
        planButton.textContent = migrationPlan?.status === "planning" ? "移行計画を解析中…" : "移行計画を表示";
        planButton.addEventListener("click", onMigrationPlan);
        actions.append(planButton);
    }
    if (fileEntry) {
        const clearButton = document.createElement("button");
        clearButton.className = "clear-selection";
        clearButton.type = "button";
        clearButton.dataset.focusKey = "action:clear";
        clearButton.textContent = "閉じる";
        clearButton.title = "プレビューを閉じて選択を解除";
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
        if (preview?.status === "reading") appendText(document, section, "本文を読込中です…", "preview-loading");
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
        renderMarkdown(document, markdown, preview.content, { currentPath: fileEntry.relativePath, currentFileId: fileEntry.id, fileEntries, onFileSelect, onResolveLink });
        section.append(markdown);
    } else {
        section.append(sourcePreview(document, fileEntry, preview.content));
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

function sourcePreview(document, fileEntry, content) {
    const preview = document.createElement("pre");
    preview.className = `text-preview source-preview source-${fileEntry.kind}`;
    const code = document.createElement("code");
    code.className = `language-${fileEntry.kind}`;
    code.textContent = formatSourceContent(fileEntry.kind, content);
    preview.append(code);
    return preview;
}

function formatSourceContent(kind, content) {
    if (kind !== "json") return content;
    try {
        return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    } catch {
        return content;
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes ?? 0} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function fileKindLabel(kind) {
    return { binary: "バイナリ", css: "CSS", html: "HTML", javascript: "JavaScript", json: "JSON", markdown: "Markdown", python: "Python", sensitive: "保護", shell: "Shell", text: "Text", toml: "TOML", yaml: "YAML" }[kind] ?? "File";
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
    destination.dataset.focusKey = "field:destination";
    destination.value = migrationCopy?.destinationName ?? "";
    destination.disabled = migrationCopy?.status === "copying";
    const confirmation = document.createElement("label");
    confirmation.className = "migration-copy-confirmation";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.focusKey = "field:confirm";
    checkbox.checked = migrationCopy?.status === "copying";
    checkbox.disabled = migrationCopy?.status === "copying";
    const confirmationText = document.createElement("span");
    confirmationText.textContent = "コピー先が存在する場合は中止されること、元のbundleを変更しないことを確認しました。";
    confirmation.append(checkbox, confirmationText);
    const copyButton = document.createElement("button");
    copyButton.className = "migration-copy-button";
    copyButton.dataset.focusKey = "action:copy";
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
    result.tabIndex = -1;
    result.textContent = `Skill bundleをコピーしました: ${copyResult.bundlePath}`;
    return result;
}

function appendPlanEntries(document, section, heading, entries, formatter) {
    if (!entries.length) return;
    const group = document.createElement("details");
    group.className = "migration-plan-group";
    group.open = entries.length <= 20;
    const title = document.createElement("summary");
    title.textContent = `${heading}（${entries.length}件）`;
    const list = document.createElement("ul");
    list.className = "migration-plan-entries";
    for (const entry of entries) {
        const item = document.createElement("li");
        item.textContent = formatter(entry);
        list.append(item);
    }
    group.append(title, list);
    section.append(group);
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
    const rootIndex = parts[0] === "~" ? 1 : 0;
    return parts.length === rootIndex + 4 && parts[rootIndex] === ".kiro" && parts[rootIndex + 1] === "skills" && parts[rootIndex + 3] === "skill.md";
}
function previewMessage(code) { return { binary: "バイナリファイルの本文は表示せず、ファイル情報だけを表示します。", sensitive: "機密性のある設定ファイルの本文は表示せず、ファイル情報だけを表示します。", too_large: "ファイルが2MiBを超えるため、本文を表示しません。", permission_denied: "ファイルの読取が許可されませんでした。", unsupported_kind: "この形式の本文は表示できません。", read_failed: "ファイル本文を読み取れませんでした。" }[code] ?? "ファイル本文を読み取れませんでした。"; }
function isDestinationName(destinationName) { const reservedNames = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)]); return typeof destinationName === "string" && Boolean(destinationName) && destinationName === destinationName.trim() && destinationName.length <= 128 && ![".", ".."].includes(destinationName) && !destinationName.toLowerCase().startsWith(".skill-copy-") && !reservedNames.has(destinationName.toLowerCase()) && !destinationName.endsWith(".") && !/[\\/:<>"|?*\0\x00-\x1f]/.test(destinationName); }
function migrationCopyMessage(code) { return { stale_plan: "表示しているSkill bundleの内容が変わったため、コピーを実行しませんでした。移行計画を再取得してください。", destination_conflict: "指定した宛先はすでに存在するため、コピーを実行しませんでした。別の宛先名を指定してください。", read_failed: "Skill bundleを安全に再確認できなかったため、コピーを実行しませんでした。", copy_failed: "Skill bundleをコピーできませんでした。元のbundleは変更していません。" }[code] ?? "Skill bundleをコピーできませんでした。元のbundleは変更していません。"; }
