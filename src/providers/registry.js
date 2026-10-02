import { claudeProvider } from "./claude.js";
import { codexProvider } from "./codex.js";
import { geminiProvider } from "./gemini.js";
import { kiroProvider } from "./kiro.js";

const providers = Object.freeze([kiroProvider, claudeProvider, geminiProvider, codexProvider]);

export function listProviders() {
    return providers.filter((provider) => provider.enabled);
}
