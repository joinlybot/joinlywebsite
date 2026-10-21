
/*
 * Joinly shared navbar loader and lightweight page navigation.
 * Keeps the navbar mounted when navigating between same-origin pages.
 */
(() => {
    const container = document.getElementById("navbar-container");
    if (!container) return;

    const CACHE_KEY = "joinly-navbar-markup-v1";
    const currentScript = document.currentScript;
    const scriptUrl = currentScript?.src
        ? new URL(currentScript.src, location.href)
        : new URL("/js/navbar.js", location.href);
    const baseUrl = new URL("/", location.origin);

    let navigationInProgress = false;

    function initDropdown() {
        const dropdown = container.querySelector(".dropdown");
        const button = dropdown?.querySelector(".dropdown-btn");
        const menu = dropdown?.querySelector(".dropdown-menu");

        if (!dropdown || !button || !menu || button.dataset.initialized === "true") {
            return;
        }

        button.dataset.initialized = "true";

        function setOpen(open) {
    button.setAttribute("aria-expanded", String(open));
    dropdown.classList.toggle("open", open);
    dropdown.classList.toggle("active", open);
}

        button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    const isOpen = button.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
});

        document.addEventListener("click", event => {
            if (!dropdown.contains(event.target)) setOpen(false);
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                setOpen(false);
                button.focus();
            }
        });
    }

    function mountNavbar(markup) {
        container.innerHTML = markup;
        container.dataset.loaded = "true";
        container.dataset.loading = "false";
        container.setAttribute("aria-busy", "false");

        initDropdown();
        document.dispatchEvent(new CustomEvent("joinly-navbar-loaded"));
    }

    async function loadNavbar() {
        if (
            container.dataset.loaded === "true" &&
            container.querySelector(".navbar")
        ) {
            initDropdown();
            return;
        }

        if (container.dataset.loading === "true") return;
        container.dataset.loading = "true";

        try {
            let markup = null;

            try {
                markup = sessionStorage.getItem(CACHE_KEY);
            } catch (_) {}

            if (!markup) {
                const response = await fetch("/components/navbar.html", {
                    credentials: "same-origin"
                });

                if (!response.ok) {
                    throw new Error(`Navbar request failed: ${response.status}`);
                }

                markup = await response.text();

                try {
                    sessionStorage.setItem(CACHE_KEY, markup);
                } catch (_) {}
            }

            mountNavbar(markup);
        } catch (error) {
            container.dataset.loading = "false";
            container.setAttribute("aria-busy", "false");
            console.error("Unable to load Joinly navbar:", error);
        }
    }

    async function navigate(url, pushHistory = true) {
        if (navigationInProgress) return;
        navigationInProgress = true;

        try {
            const response = await fetch(url.href, {
                headers: { "X-Requested-With": "fetch" },
                credentials: "same-origin"
            });

            if (!response.ok) throw new Error("Page navigation failed.");

            const html = await response.text();
            const parsed = new DOMParser().parseFromString(html, "text/html");

            const newMain = parsed.querySelector("main");
            const oldMain = document.querySelector("main");

            if (!newMain || !oldMain) {
                location.href = url.href;
                return;
            }

            oldMain.replaceWith(document.importNode(newMain, true));

            if (parsed.title) document.title = parsed.title;

            if (pushHistory) {
                history.pushState({}, "", url.href);
            }

            document.dispatchEvent(new CustomEvent("joinly-page-loaded", {
                detail: { url: url.href }
            }));

            window.scrollTo(0, 0);
        } catch (error) {
            console.warn("Using normal page navigation:", error);
            location.href = url.href;
        } finally {
            navigationInProgress = false;
        }
    }

    document.addEventListener("click", event => {
        const link = event.target.closest("a[href]");
        if (!link) return;

        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.target === "_blank" ||
            link.hasAttribute("download")
        ) return;

        const url = new URL(link.href, location.href);

        if (
            url.origin !== location.origin ||
            !["http:", "https:"].includes(url.protocol) ||
            url.pathname === location.pathname && url.hash ||
            link.matches(".dropdown-menu a[href^='http']")
        ) return;

        event.preventDefault();
        navigate(url);
    });

    window.addEventListener("popstate", () => {
        navigate(new URL(location.href), false);
    });

    loadNavbar();
})();
