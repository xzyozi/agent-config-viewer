export class Router {
    constructor({ onRouteChange, hasRootSelection }) {
        this.onRouteChange = onRouteChange;
        this.hasRootSelection = hasRootSelection;
        this.handleHashChange = this.handleHashChange.bind(this);
    }

    start() {
        window.addEventListener("hashchange", this.handleHashChange);
        this.handleHashChange();
    }

    navigate(route = "#/browse") {
        if (window.location.hash === route) {
            this.handleHashChange();
            return;
        }
        window.location.hash = route;
    }

    handleHashChange() {
        const route = window.location.hash || "#/browse";
        if (route !== "#/browse") {
            this.navigate("#/browse");
            return;
        }
        this.onRouteChange({
            name: "browse",
            noticeCode: this.hasRootSelection() ? null : "root_selection_required",
        });
    }
}
