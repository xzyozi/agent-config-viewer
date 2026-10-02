const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/;
const HEADING_PATTERN = /^ {0,3}(#{1,6})\s+(.+)$/;
const UNORDERED_ITEM_PATTERN = /^ {0,3}[-*+]\s+(.+)$/;
const ORDERED_ITEM_PATTERN = /^ {0,3}\d+[.)]\s+(.+)$/;
const INLINE_PATTERN = /(`+[^`\n]+`+)|(\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\))|(\*\*([^*\n]+)\*\*)|(__([^_\n]+)__)|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|(_([^_\n]+)_)/g;

export function renderMarkdown(document, container, source, options = {}) {
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    container.replaceChildren(renderBlocks(document, lines, options));
}

function renderBlocks(document, lines, options) {
    const fragment = document.createDocumentFragment();
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        const fence = lines[index].match(FENCE_PATTERN);
        if (fence) {
            const codeLines = [];
            const marker = fence[1][0];
            const markerLength = fence[1].length;
            index += 1;
            while (index < lines.length && !isClosingFence(lines[index], marker, markerLength)) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) index += 1;
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            if (fence[2]) code.className = `language-${safeClassName(fence[2].split(/\s+/)[0])}`;
            code.textContent = codeLines.join("\n");
            pre.append(code);
            fragment.append(pre);
            continue;
        }
        const heading = lines[index].match(HEADING_PATTERN);
        if (heading) {
            const element = document.createElement(`h${heading[1].length}`);
            appendInline(document, element, stripClosingHeadingMarks(heading[2]), options);
            fragment.append(element);
            index += 1;
            continue;
        }
        if (isHorizontalRule(lines[index])) {
            fragment.append(document.createElement("hr"));
            index += 1;
            continue;
        }
        if (/^ {0,3}>/.test(lines[index])) {
            const quoteLines = [];
            while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^ {0,3}> ?/, ""));
                index += 1;
            }
            const quote = document.createElement("blockquote");
            quote.append(renderBlocks(document, quoteLines, options));
            fragment.append(quote);
            continue;
        }
        const listMatch = lines[index].match(UNORDERED_ITEM_PATTERN) ?? lines[index].match(ORDERED_ITEM_PATTERN);
        if (listMatch) {
            const ordered = ORDERED_ITEM_PATTERN.test(lines[index]);
            const list = document.createElement(ordered ? "ol" : "ul");
            while (index < lines.length) {
                const item = (ordered ? lines[index].match(ORDERED_ITEM_PATTERN) : lines[index].match(UNORDERED_ITEM_PATTERN));
                if (!item) break;
                const listItem = document.createElement("li");
                appendInline(document, listItem, item[1], options);
                list.append(listItem);
                index += 1;
            }
            fragment.append(list);
            continue;
        }
        if (index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
            const tableResult = renderTable(document, lines, index, options);
            fragment.append(tableResult.element);
            index = tableResult.nextIndex;
            continue;
        }
        const paragraphLines = [lines[index]];
        index += 1;
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
            paragraphLines.push(lines[index]);
            index += 1;
        }
        const paragraph = document.createElement("p");
        appendInline(document, paragraph, paragraphLines.join("\n"), options);
        fragment.append(paragraph);
    }
    return fragment;
}

function renderTable(document, lines, startIndex, options) {
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const cell of splitTableRow(lines[startIndex])) {
        const header = document.createElement("th");
        appendInline(document, header, cell, options);
        headerRow.append(header);
    }
    head.append(headerRow);
    table.append(head);
    const body = document.createElement("tbody");
    let index = startIndex + 2;
    while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const row = document.createElement("tr");
        for (const cell of splitTableRow(lines[index])) {
            const tableCell = document.createElement("td");
            appendInline(document, tableCell, cell, options);
            row.append(tableCell);
        }
        body.append(row);
        index += 1;
    }
    table.append(body);
    return { element: table, nextIndex: index };
}

function appendInline(document, parent, text, options) {
    let lastIndex = 0;
    for (const match of text.matchAll(INLINE_PATTERN)) {
        const index = match.index ?? 0;
        if (index > lastIndex) parent.append(document.createTextNode(text.slice(lastIndex, index)));
        if (match[1]) {
            const code = document.createElement("code");
            code.textContent = match[1].replace(/^`+|`+$/g, "");
            parent.append(code);
        } else if (match[2]) {
            appendLink(document, parent, match[3], match[4], match[5], options);
        } else if (match[6] || match[8]) {
            const strong = document.createElement("strong");
            appendInline(document, strong, match[7] ?? match[9], options);
            parent.append(strong);
        } else if (match[10]) {
            const del = document.createElement("del");
            appendInline(document, del, match[11], options);
            parent.append(del);
        } else if (match[12] || match[14]) {
            const emphasis = document.createElement("em");
            appendInline(document, emphasis, match[13] ?? match[15], options);
            parent.append(emphasis);
        }
        lastIndex = index + match[0].length;
    }
    if (lastIndex < text.length) parent.append(document.createTextNode(text.slice(lastIndex)));
}

function appendLink(document, parent, label, target, title, options) {
    const safeTarget = target.replace(/^<|>$/g, "");
    const internalFile = resolveInternalFile(safeTarget, options.currentPath, options.fileEntries ?? []);
    if (internalFile) {
        const link = document.createElement("a");
        link.href = "#";
        link.dataset.fileId = internalFile.id;
        if (title) link.title = title;
        link.addEventListener("click", (event) => {
            event.preventDefault();
            options.onFileSelect?.(internalFile.id);
        });
        appendInline(document, link, label, options);
        parent.append(link);
        return;
    }
    if (isSafeExternalUrl(safeTarget) || safeTarget.startsWith("#")) {
        const link = document.createElement("a");
        link.href = safeTarget;
        if (safeTarget.startsWith("http:") || safeTarget.startsWith("https:")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
        if (title) link.title = title;
        appendInline(document, link, label, options);
        parent.append(link);
        return;
    }
    parent.append(document.createTextNode(label));
}

function resolveInternalFile(target, currentPath, fileEntries) {
    if (!target || target.startsWith("/") || target.includes("\\") || /[\0]/.test(target)) return null;
    const pathPart = target.split(/[?#]/, 1)[0];
    if (!pathPart) return null;
    const currentParts = currentPath.split("/");
    const rootParts = currentParts[0] === "~" && currentParts.length >= 2 ? currentParts.slice(0, 2) : currentParts.slice(0, 1);
    if (!rootParts.length || !rootParts[0]) return null;
    const rootPrefix = rootParts.join("/");
    const targetParts = pathPart === rootPrefix || pathPart.startsWith(`${rootPrefix}/`)
        ? pathPart.split("/")
        : [...currentParts.slice(0, -1), ...pathPart.split("/")];
    const normalized = [];
    for (const part of targetParts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (normalized.length <= rootParts.length) return null;
            normalized.pop();
            continue;
        }
        normalized.push(part);
    }
    if (normalized.slice(0, rootParts.length).join("/") !== rootPrefix) return null;
    const relativePath = normalized.join("/");
    return fileEntries.find((entry) => entry.relativePath === relativePath)
        ?? fileEntries.find((entry) => entry.relativePath.toLowerCase() === relativePath.toLowerCase())
        ?? null;
}

function isSafeExternalUrl(target) {
    return /^(?:https?:|mailto:)/i.test(target);
}

function isClosingFence(line, marker, markerLength) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    return Boolean(match && match[1][0] === marker && match[1].length >= markerLength);
}

function isHorizontalRule(line) {
    return /^ {0,3}(?:\*\s*){3,}$/.test(line) || /^ {0,3}(?:-\s*){3,}$/.test(line) || /^ {0,3}(?:_\s*){3,}$/.test(line);
}

function isTableDelimiter(line) {
    const cells = splitTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
}

function isBlockStart(lines, index) {
    return Boolean(lines[index].match(FENCE_PATTERN) || lines[index].match(HEADING_PATTERN) || /^ {0,3}>/.test(lines[index]) || UNORDERED_ITEM_PATTERN.test(lines[index]) || ORDERED_ITEM_PATTERN.test(lines[index]) || isHorizontalRule(lines[index]) || (index + 1 < lines.length && isTableDelimiter(lines[index + 1])));
}

function stripClosingHeadingMarks(text) {
    return text.replace(/\s+#+\s*$/, "");
}

function safeClassName(value) {
    return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}
