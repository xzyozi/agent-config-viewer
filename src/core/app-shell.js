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
        this.browseState = { ...this.browseState, selectedProviderId: providerId, selectedFileId: null, preview: null, migrationPlan: null, migrationCopy: null, copyResult: null };
        this.renderBrowse();
    }

    async selectFile(fileId) {
        const fileEntry = this.findFile(fileId);
        if (!fileEntry) return;
        this.browseState = { ...this.browseState, selectedFileId: fileId, preview: { status: "reading", fileId }, migrationPlan: null, migrationCopy: null, copyResult: null };
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
        this.browseState = { ...this.browseState, migrationPlan: { status: "planning", fileId: fileEntry.id }, migrationCopy: null, copyResult: null };
        this.renderBrowse();
        try {
            const plan = await this.catalog.planSkillMigration(fileEntry);
            this.setMigrationPlan(fileEntry.id, { status: "ready", fileId: fileEntry.id, plan });
        } catch (error) {
            this.setMigrationPlan(fileEntry.id, { status: "error", fileId: fileEntry.id, code: error?.code ?? "read_failed" });
        }
    }

    async copySkillBundle(destinationName, confirmed) {
        const fileEntry = this.findFile(this.browseState?.selectedFileId);
        const migrationPlan = this.browseState?.migrationPlan;
        if (!fileEntry || migrationPlan?.status !== "ready" || migrationPlan.fileId !== fileEntry.id || this.browseState?.migrationCopy?.status === "copying" || !confirmed || !isDestinationName(destinationName)) return;
        const normalizedName = destinationName.trim();
        this.browseState = { ...this.browseState, migrationCopy: { status: "copying", destinationName: normalizedName } };
        this.renderBrowse();
        try {
            const result = await this.catalog.copySkillBundle(fileEntry, migrationPlan.plan.snapshotDigest, normalizedName);
            this.view.renderScanning();
            const rescanState = await this.catalog.rescan();
            this.browseState = { ...rescanState, selectedProviderId: "kiro", copyResult: result };
            this.renderBrowse();
        } catch (error) {
            if (this.browseState?.selectedFileId !== fileEntry.id) return;
            this.browseState = { ...this.browseState, migrationCopy: { status: "error", code: copyErrorCode(error?.code), destinationName: normalizedName } };
            this.renderBrowse();
        }
    }

    clearSelection() {
        if (!this.browseState?.selectedFileId) return;
        this.browseState = { ...this.browseState, selectedFileId: null, preview: null, migrationPlan: null, migrationCopy: null, copyResult: null };
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
            (destinationName, confirmed) => this.copySkillBundle(destinationName, confirmed),
        );
    }
}

function isDestinationName(destinationName) {
    const normalizedName = typeof destinationName === "string" ? destinationName.trim() : "";
    const reservedNames = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)]);
    return Boolean(normalizedName)
        && normalizedName === destinationName
        && normalizedName.length <= 128
        && ![".", ".."].includes(normalizedName)
        && !normalizedName.toLowerCase().startsWith(".skill-copy-")
        && !reservedNames.has(normalizedName.toLowerCase())
        && !normalizedName.endsWith(".")
        && !/[\\/:<>"|?*\0\x00-\x1f]/.test(normalizedName);
}

function copyErrorCode(code) {
    return ["stale_plan", "destination_conflict", "copy_failed", "read_failed"].includes(code) ? code : "copy_failed";
}
