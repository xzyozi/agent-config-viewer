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

    renderNotice() {
        this.setStatus("フォルダを選択してください。");
        this.renderMessage("フォルダの選択状態は保存されません。再読み込み後は再選択してください。", "notice");
    }

    renderScanning() {
        this.setStatus("対応する設定ディレクトリを確認しています…", "progress");
        this.catalog.replaceChildren();
    }

    renderError(error) {
        const messages = { unsupported_browser: "このブラウザはフォルダ選択に対応していません。Chromium系ブラウザを使用してください。", unexpected: "フォルダの確認中に予期しない問題が発生しました。" };
        this.setStatus(messages[error.code] ?? messages.unexpected, "error");
        this.renderMessage("ファイル内容や詳細な例外情報は表示しません。", "notice");
    }

    renderBrowse(browseState) {
        const results = browseState.providerResults;
        this.setStatus(results.some((result) => result.status === "ok") ? "検出結果を表示しています。" : "対応する設定ディレクトリは見つかりませんでした。");
        this.catalog.replaceChildren(...results.map((result) => this.providerSection(result)));
    }

    renderMessage(message, className = "empty") {
        const element = this.document.createElement("p");
        element.className = className;
        element.textContent = message;
        this.catalog.replaceChildren(element);
    }

    providerSection(result) {
        const section = this.document.createElement("section");
        section.className = "provider";
        const title = this.document.createElement("h2");
        title.textContent = result.providerId === "kiro" ? "Kiro" : result.providerId;
        section.append(title);
        if (result.status !== "ok") return appendText(this.document, section, providerMessage(result.status), "empty");
        if (!result.fileEntries.length) return appendText(this.document, section, "対象ファイルはありません。", "empty");
        for (const [name, entries] of groupByCategory(result.fileEntries)) section.append(categorySection(this.document, name, entries));
        return section;
    }
}

function appendText(document, parent, text, className) { const element = document.createElement("p"); element.className = className; element.textContent = text; parent.append(element); return parent; }
function providerMessage(status) { return { not_found: "設定ディレクトリは見つかりません。", permission_denied: "設定ディレクトリへのアクセスが許可されませんでした。", list_failed: "ファイル一覧を取得できませんでした。" }[status]; }
function groupByCategory(entries) { const groups = new Map(); for (const entry of entries) { const group = groups.get(entry.categoryName) ?? []; group.push(entry); groups.set(entry.categoryName, group); } return groups; }
function categorySection(document, name, entries) { const section = document.createElement("div"); section.className = "category"; const title = document.createElement("h3"); title.textContent = name; const list = document.createElement("ul"); for (const entry of entries) { const item = document.createElement("li"); item.textContent = entry.relativePath; list.append(item); } section.append(title, list); return section; }
