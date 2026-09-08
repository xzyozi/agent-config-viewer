import { createProvider } from "./provider.js";

export const codexProvider = createProvider({
    id: "codex",
    label: "Codex",
    rootDir: ".codex",
    enabled: true,
    categories: [
        { name: "Settings", path: ".", patterns: ["config.toml", "*.config.toml"], displayOrder: 0 },
    ],
});
