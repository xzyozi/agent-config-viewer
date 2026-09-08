import { createProvider } from "./provider.js";

export const kiroProvider = createProvider({
    id: "kiro",
    label: "Kiro",
    rootDir: ".kiro",
    enabled: true,
    categories: [
        { name: "Steering", path: "steering", patterns: ["**/*.md"], displayOrder: 0 },
        { name: "Skills", path: "skills", patterns: ["**/SKILL.md"], displayOrder: 1 },
        { name: "Knowledge", path: "knowledge", patterns: ["**/*.md"], displayOrder: 2 },
    ],
});
