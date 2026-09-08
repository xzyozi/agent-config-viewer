export class AppShell {
    constructor({ catalog, view }) {
        this.catalog = catalog;
        this.view = view;
        this.browseState = null;
    }

    start() {
        this.scan();
    }

    async scan() {
        this.view.renderScanning();
        try {
            this.browseState = await this.catalog.discover();
            this.renderBrowse();
        } catch {
            this.view.renderError({ code: "unexpected" });
        }
    }

    selectProvider(providerId) {
        if (!this.browseState?.providerResults.some((result) => result.providerId === providerId)) return;
        this.browseState = { ...this.browseState, selectedProviderId: providerId };
        this.renderBrowse();
    }

    renderBrowse() {
        this.view.renderBrowse(this.browseState, (providerId) => this.selectProvider(providerId));
    }
}
