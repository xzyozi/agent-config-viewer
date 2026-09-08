const CATALOG_PATH = "/api/catalog";

export class FileReadError extends Error {
    constructor(code = "read_failed") {
        super(code);
        this.code = code;
    }
}

export class LocalConfigSource {
    constructor(fetchFn = window.fetch.bind(window)) {
        this.fetchFn = fetchFn;
        this.results = null;
    }

    async listProviderResults(providers) {
        const results = await this.load();
        const byId = new Map(results.map((result) => [result.providerId, result]));
        return providers.map((provider) => byId.get(provider.id) ?? missingResult(provider.id));
    }

    async readText(fileId) {
        const response = await this.fetchFn(`/api/files/${encodeURIComponent(fileId)}/content`, { headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload.content !== "string" || payload.fileId !== fileId) {
            throw new FileReadError(payload?.code === "too_large" ? "too_large" : "read_failed");
        }
        return payload.content;
    }

    async load() {
        if (this.results) return this.results;
        const response = await this.fetchFn(CATALOG_PATH, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("The local catalog endpoint is unavailable.");
        const payload = await response.json();
        if (!Array.isArray(payload.providerResults)) throw new Error("The local catalog response is invalid.");
        this.results = payload.providerResults;
        return this.results;
    }
}

function missingResult(providerId) { return { providerId, status: "not_found", fileEntries: [], errorKind: "not_found" }; }
