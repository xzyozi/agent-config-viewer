const MAX_READABLE_BYTES = 2 * 1024 * 1024;

export class FileSystemAccessAdapter {
    constructor() {
        this.fileHandles = new Map();
        this.nextFileId = 0;
        this.rootSelection = null;
    }

    async pickRoot() {
        if (typeof window.showDirectoryPicker !== "function") {
            throw unsupportedBrowserError();
        }
        const handle = await window.showDirectoryPicker({ mode: "read" });
        this.fileHandles.clear();
        this.nextFileId = 0;
        this.rootSelection = { handle };
        return this.rootSelection;
    }

    async probe(rootSelection, provider) {
        try {
            await this.getProviderRoot(rootSelection, provider);
            return { found: true };
        } catch (error) {
            if (error.name === "NotFoundError") {
                return { found: false };
            }
            throw error;
        }
    }

    async listFiles(rootSelection, provider) {
        const providerRoot = await this.getProviderRoot(rootSelection, provider);
        const entries = [];
        for (const category of provider.categories) {
            const categoryRoot = await getDirectory(providerRoot, category.path);
            if (categoryRoot) {
                await this.collectFiles(categoryRoot, provider, category, [], entries);
            }
        }
        return entries;
    }

    async readText(entry) {
        if (!entry.readable || !this.fileHandles.has(entry.id)) {
            throw new DOMException("The selected file is unavailable.", "NotFoundError");
        }
        return (await this.fileHandles.get(entry.id).getFile()).text();
    }

    clear() {
        this.fileHandles.clear();
        this.rootSelection = null;
    }

    async getProviderRoot(rootSelection, provider) {
        if (rootSelection.handle.name === provider.rootDir) {
            return rootSelection.handle;
        }
        return rootSelection.handle.getDirectoryHandle(provider.rootDir);
    }

    async collectFiles(directory, provider, category, segments, entries) {
        for await (const [name, handle] of directory.entries()) {
            if (handle.kind === "directory") {
                await this.collectFiles(handle, provider, category, [...segments, name], entries);
            } else if (handle.kind === "file" && matchesPattern(name, category.patterns)) {
                const id = `file-${++this.nextFileId}`;
                const entry = await this.createFileEntry(handle, id, provider, category, [...segments, name]);
                this.fileHandles.set(id, handle);
                entries.push(entry);
            }
        }
    }

    async createFileEntry(handle, id, provider, category, pathParts) {
        let sizeBytes = 0;
        let readable = true;
        let unreadableReason = null;
        try {
            sizeBytes = (await handle.getFile()).size;
            if (sizeBytes > MAX_READABLE_BYTES) {
                readable = false;
                unreadableReason = "too_large";
            }
        } catch (error) {
            readable = false;
            unreadableReason = "permission_denied";
        }
        return {
            id,
            providerId: provider.id,
            categoryName: category.name,
            relativePath: [provider.rootDir, category.path, ...pathParts].filter((part) => part && part !== ".").join("/"),
            displayName: pathParts.at(-1),
            kind: fileKind(pathParts.at(-1)),
            sizeBytes,
            readable,
            unreadableReason,
        };
    }
}

async function getDirectory(directory, relativePath) {
    let current = directory;
    for (const segment of relativePath.split("/").filter((part) => part && part !== ".")) {
        try { current = await current.getDirectoryHandle(segment); } catch (error) {
            if (error.name === "NotFoundError") return null;
            throw error;
        }
    }
    return current;
}

function matchesPattern(name, patterns) {
    return patterns.some((pattern) => (pattern === "**/*.md" && name.endsWith(".md")) || (pattern === "**/SKILL.md" && name === "SKILL.md") || pattern === name);
}

function fileKind(name) {
    if (name.endsWith(".md")) return "markdown";
    if (name.endsWith(".json")) return "json";
    if (name.endsWith(".toml")) return "toml";
    return "text";
}

function unsupportedBrowserError() {
    return { code: "unsupported_browser", scope: "application", retryable: false, recoveryAction: "none", messageKey: "browser_unsupported", fileId: null };
}
