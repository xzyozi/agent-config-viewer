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
        };
    }

    async readText(fileEntry) {
        if (!fileEntry.readable) throw { code: fileEntry.unreadableReason ?? "read_failed" };
        return this.source.readText(fileEntry.id);
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
    return parts.length === 4 && parts[0] === ".kiro" && parts[1] === "skills" && parts[3] === "skill.md";
}

function missingResult(providerId) { return { providerId, status: "not_found", fileEntries: [], tree: null, errorKind: "not_found" }; }
