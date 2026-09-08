import { createProvider } from "./provider.js";

export const geminiProvider = createProvider({
    id: "gemini",
    label: "Gemini",
    rootDir: ".gemini",
    enabled: true,
    categories: [
        { name: "Settings", path: ".", patterns: ["settings.json"], displayOrder: 0 },
        { name: "Commands", path: "commands", patterns: ["**/*.toml"], displayOrder: 1 },
        { name: "Skills", path: "skills", patterns: ["**/SKILL.md"], displayOrder: 2 },
    ],
});
