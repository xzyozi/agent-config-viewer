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
            selectedFileId: null,
            preview: null,
            migrationPlan: null,
            noticeCode: null,
            directoryLoadingKey: null,
            directoryErrorKey: null,
        };
    }

    async readText(fileEntry) {
        if (!fileEntry.readable) throw { code: fileEntry.unreadableReason ?? "read_failed" };
        return this.source.readText(fileEntry.id);
    }

    async listDirectory(directoryId) {
        if (typeof directoryId !== "string" || !directoryId) throw { code: "read_failed" };
        return this.source.listDirectory(directoryId);
    }

    async planSkillMigration(fileEntry) {
        if (!isKiroSkill(fileEntry)) throw { code: "read_failed" };
        return this.source.getSkillMigrationPlan(fileEntry.id);
    }

    async copySkillBundle(fileEntry, snapshotDigest, destinationName) {
        if (!isKiroSkill(fileEntry)) throw { code: "read_failed" };
        return this.source.copySkillBundle(fileEntry.id, { snapshotDigest, destinationName });
    }

    async rescan() {
        this.source.refresh();
        return this.discover();
    }
}

function isKiroSkill(fileEntry) {
    if (!fileEntry?.readable || fileEntry.providerId !== "kiro" || fileEntry.categoryName !== "Skills") return false;
    const parts = fileEntry.relativePath.toLowerCase().split("/");
    const rootIndex = parts[0] === "~" && parts[1] === ".kiro" ? 2 : 0;
    return parts.length === rootIndex + 4 && parts[rootIndex] === ".kiro" && parts[rootIndex + 1] === "skills" && parts[rootIndex + 3] === "skill.md";
}

function missingResult(providerId) { return { providerId, status: "not_found", fileEntries: [], tree: null, errorKind: "not_found" }; }
