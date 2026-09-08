export class AppShell {
    constructor({ source, catalog, view, Router }) {
        this.source = source;
        this.catalog = catalog;
        this.view = view;
        this.rootSelection = null;
        this.browseState = null;
        this.router = new Router({
            hasRootSelection: () => Boolean(this.rootSelection),
            onRouteChange: (route) => this.handleRoute(route),
        });
    }

    start() {
        document.querySelector("#select-root").addEventListener("click", () => this.selectRoot());
        this.router.start();
    }

    async selectRoot() {
        try {
            this.view.setStatus("フォルダ選択を待機しています…", "progress");
            this.rootSelection = await this.source.pickRoot();
            this.browseState = null;
            await this.scan();
        } catch (error) {
            if (error.name === "AbortError") {
                this.view.setStatus("フォルダ選択を取り消しました。");
            } else if (isErrorDto(error)) {
                this.view.renderError(error);
            } else {
                this.view.renderError({ code: "unexpected" });
            }
        }
    }

    async scan() {
        this.view.renderScanning();
        this.browseState = await this.catalog.discover(this.rootSelection);
        this.router.navigate("#/browse");
    }

    handleRoute(route) {
        if (route.noticeCode) {
            this.view.renderNotice();
        } else if (this.browseState) {
            this.view.renderBrowse(this.browseState);
        }
    }
}

function isErrorDto(error) {
    return error && ["unsupported_browser", "read_failed", "render_failed", "unexpected"].includes(error.code);
}
