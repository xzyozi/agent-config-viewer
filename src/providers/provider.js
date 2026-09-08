const PROVIDER_ID = /^[a-z0-9-]+$/;

export function createProvider(specification) {
    const { id, label, rootDir, categories, enabled = true } = specification;
    if (!PROVIDER_ID.test(id) || !label || !rootDir || rootDir.includes("..")) {
        throw new TypeError("Invalid provider definition.");
    }
    if (!Array.isArray(categories) || categories.length === 0) {
        throw new TypeError("A provider requires at least one category.");
    }
    const names = new Set();
    for (const category of categories) {
        if (!category.name || names.has(category.name) || category.path.includes("..") || !category.patterns?.length) {
            throw new TypeError("Invalid provider category.");
        }
        names.add(category.name);
    }
    return Object.freeze({
        id,
        label,
        rootDir,
        categories: Object.freeze([...categories].sort((a, b) => a.displayOrder - b.displayOrder)),
        enabled: Boolean(enabled),
    });
}
