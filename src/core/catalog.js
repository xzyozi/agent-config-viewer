export class Catalog {
    constructor({ source, listProviders }) {
        this.source = source;
        this.listProviders = listProviders;
    }

    async discover(rootSelection) {
        const providerResults = await Promise.all(
            this.listProviders().map((provider) => this.discoverProvider(rootSelection, provider)),
        );
        return { providerResults, selectedProviderId: null, selectedCategory: null, noticeCode: null };
    }

    async discoverProvider(rootSelection, provider) {
        try {
            const detection = await this.source.probe(rootSelection, provider);
            if (!detection.found) {
                return this.result(provider.id, "not_found");
            }
            const fileEntries = await this.source.listFiles(rootSelection, provider);
            return { providerId: provider.id, status: "ok", fileEntries, errorKind: null };
        } catch (error) {
            const status = error.name === "NotAllowedError" || error.name === "SecurityError"
                ? "permission_denied" : "list_failed";
            return this.result(provider.id, status);
        }
    }

    result(providerId, status) {
        return { providerId, status, fileEntries: [], errorKind: status };
    }
}
