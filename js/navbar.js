/*
 * Loads the shared navbar component. The fixed-height slot prevents layout
 * shifts while the component is fetched, and the navbar fades in once ready.
 */
(() => {
    const container = document.getElementById("navbar-container");
    if (!container) return;

    fetch("/components/navbar.html", { credentials: "same-origin" })
        .then(response => {
            if (!response.ok) throw new Error(`Navbar request failed: ${response.status}`);
            return response.text();
        })
        .then(markup => {
            container.innerHTML = markup;
            container.setAttribute("aria-busy", "false");
            container.classList.add("navbar-ready");
            document.dispatchEvent(new CustomEvent("joinly-navbar-loaded"));
        })
        .catch(error => {
            container.setAttribute("aria-busy", "false");
            console.error("Unable to load the shared navbar.", error);
        });

    const prefetched = new Set();
    function prefetchLink(link) {
        if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
        let url;
        try { url = new URL(link.href, location.href); } catch { return; }
        if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol) ||
            (url.pathname === location.pathname && url.search === location.search) ||
            prefetched.has(url.href)) return;
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
