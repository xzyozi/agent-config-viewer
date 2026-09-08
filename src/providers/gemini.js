import { createProvider } from "./provider.js";

export const geminiProvider = createProvider({
    id: "gemini",
    label: "Gemini",
    rootDir: ".gemini",
    enabled: true,
    categories: [
        { name: "Global Instructions", scope: "home", path: ".", patterns: ["GEMINI.md"], displayOrder: 0 },
        { name: "Settings", path: ".", patterns: ["settings.json"], displayOrder: 1 },
        { name: "Commands", path: "commands", patterns: ["**/*.toml"], displayOrder: 2 },
        { name: "Skills", path: "skills", patterns: ["**/SKILL.md"], displayOrder: 3 },
    ],
});
