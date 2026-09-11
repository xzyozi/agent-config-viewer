export class AppShell {
    constructor({ catalog, view }) {
        this.catalog = catalog;
        this.view = view;
        this.browseState = null;
    }

    start() { this.scan(); }

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
        this.browseState = { ...this.browseState, selectedProviderId: providerId, selectedFileId: null, preview: null, migrationPlan: null };
        this.renderBrowse();
    }

    async selectFile(fileId) {
        const fileEntry = this.findFile(fileId);
        if (!fileEntry) return;
        this.browseState = { ...this.browseState, selectedFileId: fileId, preview: { status: "reading", fileId }, migrationPlan: null };
        this.renderBrowse();
        try {
            const content = await this.catalog.readText(fileEntry);
            this.setPreview(fileId, { status: "ready", fileId, displayName: fileEntry.displayName, content });
        } catch (error) {
            this.setPreview(fileId, { status: "error", fileId, code: error?.code === "too_large" ? "too_large" : error?.code ?? "read_failed" });
        }
    }

    async planSkillMigration() {
        const fileEntry = this.findFile(this.browseState?.selectedFileId);
        if (!fileEntry) return;
        this.browseState = { ...this.browseState, migrationPlan: { status: "planning", fileId: fileEntry.id } };
        this.renderBrowse();
        try {
            const plan = await this.catalog.planSkillMigration(fileEntry);
            this.setMigrationPlan(fileEntry.id, { status: "ready", fileId: fileEntry.id, plan });
        } catch (error) {
            this.setMigrationPlan(fileEntry.id, { status: "error", fileId: fileEntry.id, code: error?.code ?? "read_failed" });
        }
    }

    clearSelection() {
        if (!this.browseState?.selectedFileId) return;
        this.browseState = { ...this.browseState, selectedFileId: null, preview: null, migrationPlan: null };
        this.renderBrowse();
    }

    setPreview(fileId, preview) {
        if (this.browseState?.selectedFileId !== fileId) return;
        this.browseState = { ...this.browseState, preview };
        this.renderBrowse();
    }

    setMigrationPlan(fileId, migrationPlan) {
        if (this.browseState?.selectedFileId !== fileId) return;
        this.browseState = { ...this.browseState, migrationPlan };
        this.renderBrowse();
    }

    findFile(fileId) {
        return this.browseState?.providerResults.flatMap((result) => result.fileEntries).find((entry) => entry.id === fileId);
    }

    renderBrowse() {
        this.view.renderBrowse(
            this.browseState,
            (providerId) => this.selectProvider(providerId),
            (fileId) => this.selectFile(fileId),
            () => this.clearSelection(),
            () => this.planSkillMigration(),
        );
    }
}
