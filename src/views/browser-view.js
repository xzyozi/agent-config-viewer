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

    renderBrowse(browseState, onProviderSelect) {
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
        this.renderProvider(panel, selected);
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
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = results.findIndex((result) => result.providerId === selectedProviderId);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? results.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : results.length - 1)) % results.length;
        onProviderSelect(results[next].providerId);
        queueMicrotask(() => this.document.querySelector(`#tab-${results[next].providerId}`)?.focus());
    }

    renderProvider(panel, result) {
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
        for (const [name, entries] of groupByCategory(result.fileEntries)) panel.append(categorySection(this.document, name, entries));
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
function categorySection(document, name, entries) { const section = document.createElement("div"); section.className = "category"; const title = document.createElement("h3"); title.textContent = name; const list = document.createElement("ul"); for (const entry of entries) { const item = document.createElement("li"); item.textContent = entry.relativePath; list.append(item); } section.append(title, list); return section; }
