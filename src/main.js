import { AppShell } from "./core/app-shell.js";
import { Catalog } from "./core/catalog.js";
import { Router } from "./core/router.js";
import { listProviders } from "./providers/registry.js";
import { FileSystemAccessAdapter } from "./sources/file-system-access.js";
import { BrowserView } from "./views/browser-view.js";

const source = new FileSystemAccessAdapter();
const view = new BrowserView(document);
const catalog = new Catalog({ source, listProviders });
const app = new AppShell({ source, catalog, view, Router });

app.start();
