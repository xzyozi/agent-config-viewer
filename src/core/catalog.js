export class Catalog {
    constructor({ source, listProviders }) {
        this.source = source;
        this.listProviders = listProviders;
    }

    async discover() {
        const providers = this.listProviders();
        const results = await this.source.listProviderResults(providers);
        const providerResults = providers.map((provider) => ({
            ...results.find((result) => result.providerId === provider.id) ?? missingResult(provider.id),
            label: provider.label,
        }));
        return {
            providerResults,
            selectedProviderId: providerResults.find((result) => result.status === "ok")?.providerId ?? providerResults[0]?.providerId ?? null,
            selectedCategory: null,
            noticeCode: null,
        };
    }
}

function missingResult(providerId) {
    return { providerId, status: "not_found", fileEntries: [], errorKind: "not_found" };
}
