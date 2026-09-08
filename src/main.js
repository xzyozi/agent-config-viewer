import { AppShell } from "./core/app-shell.js";
import { Catalog } from "./core/catalog.js";
import { listProviders } from "./providers/registry.js";
import { LocalConfigSource } from "./sources/local-config-source.js";
import { BrowserView } from "./views/browser-view.js";

const source = new LocalConfigSource();
const view = new BrowserView(document);
const catalog = new Catalog({ source, listProviders });
const app = new AppShell({ catalog, view });

app.start();
