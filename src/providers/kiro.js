import { createProvider } from "./provider.js";

export const kiroProvider = createProvider({
    id: "kiro",
    label: "Kiro",
    rootDir: ".kiro",
    enabled: true,
    categories: [
        { name: "All", path: ".", patterns: ["**/*"], displayOrder: 0 },
    ],
});
