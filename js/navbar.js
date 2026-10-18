/*
 * The shared navbar is rendered directly in each HTML page to prevent
 * layout flicker. This script only warms same-origin page navigations.
 */
(() => {
    const prefetched = new Set();

    function prefetchLink(link) {
        if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

        let url;
        try {
            url = new URL(link.href, window.location.href);
        } catch {
            return;
        }

        if (url.origin !== window.location.origin) return;
        if (!["http:", "https:"].includes(url.protocol)) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
        if (prefetched.has(url.href)) return;

        prefetched.add(url.href);
        const hint = document.createElement("link");
        hint.rel = "prefetch";
        hint.href = url.href;
        hint.as = "document";
        document.head.appendChild(hint);
    }

    document.addEventListener("pointerover", (event) => {
        const link = event.target.closest?.(".dropdown-menu a, .logo");
        if (link) prefetchLink(link);
    }, { passive: true });

    document.addEventListener("focusin", (event) => {
        const link = event.target.closest?.(".dropdown-menu a, .logo");
        if (link) prefetchLink(link);
    });
})();
