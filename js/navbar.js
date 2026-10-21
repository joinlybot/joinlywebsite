/*
 * Loads the shared navbar without animating its appearance.
 * A session cache avoids refetching the component on every same-session page visit.
 */
(() => {
    const container = document.getElementById("navbar-container");
    if (!container || container.dataset.loading === "true" || container.dataset.loaded === "true") return;

    container.dataset.loading = "true";

    const cacheKey = "joinly-navbar-markup-v1";

    function mountNavbar(markup) {
        container.innerHTML = markup;
        container.dataset.loaded = "true";
        container.dataset.loading = "false";
        container.setAttribute("aria-busy", "false");
        container.classList.add("navbar-ready");
        document.dispatchEvent(new CustomEvent("joinly-navbar-loaded"));
    }

    let cachedMarkup = null;
    try {
        cachedMarkup = sessionStorage.getItem(cacheKey);
    } catch (_) {
        // Storage can be unavailable in privacy-restricted contexts.
    }

    if (cachedMarkup) {
        mountNavbar(cachedMarkup);
    } else {
        fetch("/components/navbar.html", { credentials: "same-origin", cache: "default" })
            .then(response => {
                if (!response.ok) throw new Error(`Navbar request failed: ${response.status}`);
                return response.text();
            })
            .then(markup => {
                try {
                    sessionStorage.setItem(cacheKey, markup);
                } catch (_) {
                    // The navbar still works when storage is unavailable.
                }
                mountNavbar(markup);
            })
            .catch(error => {
                container.dataset.loading = "false";
                container.setAttribute("aria-busy", "false");
                console.error("Unable to load the shared navbar.", error);
            });
    }

    const prefetched = new Set();

    function prefetchLink(link) {
        if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

        let url;
        try {
            url = new URL(link.href, location.href);
        } catch (_) {
            return;
        }

        if (
            url.origin !== location.origin ||
            !["http:", "https:"].includes(url.protocol) ||
            (url.pathname === location.pathname && url.search === location.search) ||
            prefetched.has(url.href)
        ) return;

        prefetched.add(url.href);
        const hint = document.createElement("link");
        hint.rel = "prefetch";
        hint.href = url.href;
        hint.as = "document";
        document.head.appendChild(hint);
    }

    document.addEventListener("pointerover", event => {
        const link = event.target.closest?.(".dropdown-menu a, .logo");
        if (link) prefetchLink(link);
    }, { passive: true });

    document.addEventListener("focusin", event => {
        const link = event.target.closest?.(".dropdown-menu a, .logo");
        if (link) prefetchLink(link);
    });
})();
