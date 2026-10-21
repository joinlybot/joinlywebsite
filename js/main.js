
function initJoinlyMain() {
    /*
     * The shared navbar dropdown is managed by js/navbar.js.
     * Do not attach a second click handler to it here.
     */

    const navbar = document.querySelector(".navbar");

    if (navbar && navbar.dataset.scrollInitialized !== "true") {
        navbar.dataset.scrollInitialized = "true";

        const updateNavbar = () => {
            if (window.scrollY > 15) {
                navbar.style.background = "rgba(11,15,22,.90)";
                navbar.style.boxShadow = "0 10px 35px rgba(0,0,0,.35)";
            } else {
                navbar.style.background = "rgba(11,15,22,.65)";
                navbar.style.boxShadow = "none";
            }
        };

        window.addEventListener("scroll", updateNavbar, { passive: true });
        updateNavbar();
    }

    /*
     * FEATURES SUBMENU
     */
    document.querySelectorAll(".features-dropdown").forEach(item => {
        if (item.dataset.joinlyInitialized === "true") return;
        item.dataset.joinlyInitialized = "true";

        item.addEventListener("mouseenter", () => item.classList.add("active"));
        item.addEventListener("mouseleave", () => item.classList.remove("active"));
    });

    /*
     * FEATURE CARD ANIMATIONS
     */
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        document.querySelectorAll(".feature-card:not([data-animation-initialized])")
            .forEach(card => {
                card.dataset.animationInitialized = "true";
                card.classList.add("hidden");
                observer.observe(card);
            });
    }

    /*
     * SMOOTH ANCHOR SCROLLING
     */
    document.querySelectorAll('a[href^="#"]:not([data-anchor-initialized])')
        .forEach(anchor => {
            anchor.dataset.anchorInitialized = "true";

            anchor.addEventListener("click", event => {
                const href = anchor.getAttribute("href");
                if (!href || href === "#") return;

                const target = document.querySelector(href);
                if (!target) return;

                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth" });
            });
        });

    /*
     * ACTIVE DROPDOWN LINK
     */
    const current = window.location.pathname.replace(/\/$/, "") || "/";

    document.querySelectorAll(".dropdown-menu a").forEach(link => {
        let url;

        try {
            url = new URL(link.href, window.location.href);
        } catch {
            return;
        }

        if (url.origin !== window.location.origin) return;

        const href = url.pathname.replace(/\/$/, "") || "/";

        if (href === current) {
            link.classList.add("active-link");
        } else {
            link.classList.remove("active-link");
        }
    });

    /*
     * JOIN LOG MODAL
     */
    const joinLogExample = document.querySelector(".join-log-reference");
    const joinLogModal = document.querySelector("#join-log-modal");

    if (joinLogExample && joinLogModal &&
        joinLogExample.dataset.modalInitialized !== "true") {
        joinLogExample.dataset.modalInitialized = "true";

        const closeButtons = joinLogModal.querySelectorAll("[data-close-join-log]");

        const openModal = () => {
            joinLogModal.classList.add("active");
            joinLogModal.setAttribute("aria-hidden", "false");
            document.body.classList.add("modal-open");
        };

        const closeModal = () => {
            joinLogModal.classList.remove("active");
            joinLogModal.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
        };

        joinLogExample.addEventListener("click", openModal);

        joinLogExample.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openModal();
            }
        });

        closeButtons.forEach(button => {
            button.addEventListener("click", closeModal);
        });

        joinLogModal.addEventListener("click", event => {
            if (event.target === joinLogModal) closeModal();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeModal();
        });
    }

    document.body.classList.add("loaded");
}

/*
 * Run on the first page load and whenever js/navbar.js replaces page content.
 */
document.addEventListener("DOMContentLoaded", initJoinlyMain);
document.addEventListener("joinly-page-loaded", initJoinlyMain);
document.addEventListener("joinly-navbar-loaded", initJoinlyMain);
