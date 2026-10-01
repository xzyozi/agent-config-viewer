import { kiroProvider } from "./kiro.js";

const providers = Object.freeze([kiroProvider]);

export function listProviders() {
    return providers.filter((provider) => provider.enabled);
}
