import { createProvider } from "./provider.js";

export const claudeProvider = createProvider({
    id: "claude",
    label: "Claude",
    rootDir: ".claude",
    enabled: true,
    categories: [
        { name: "Settings", path: ".", patterns: ["settings.json"], displayOrder: 0 },
        { name: "Rules", path: "rules", patterns: ["**/*.md"], displayOrder: 1 },
        { name: "Skills", path: "skills", patterns: ["**/SKILL.md"], displayOrder: 2 },
        { name: "Commands", path: "commands", patterns: ["**/*.md"], displayOrder: 3 },
        { name: "Agents", path: "agents", patterns: ["**/*.md"], displayOrder: 4 },
    ],
});
