import { createProvider } from "./provider.js";

export const claudeProvider = createProvider({
    id: "claude",
    label: "Claude",
    rootDir: ".claude",
    enabled: true,
    categories: [
        { name: "Global Instructions", scope: "home", path: ".", patterns: ["CLAUDE.md"], displayOrder: 0 },
        { name: "Settings", path: ".", patterns: ["settings.json"], displayOrder: 1 },
        { name: "Rules", path: "rules", patterns: ["**/*.md"], displayOrder: 2 },
        { name: "Skills", path: "skills", patterns: ["**/SKILL.md"], displayOrder: 3 },
        { name: "Commands", path: "commands", patterns: ["**/*.md"], displayOrder: 4 },
        { name: "Agents", path: "agents", patterns: ["**/*.md"], displayOrder: 5 },
    ],
});
