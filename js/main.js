document.addEventListener("DOMContentLoaded", () => {

    /*
        MAIN NAVBAR DROPDOWN
    */

    const dropdown = document.querySelector(".dropdown");
    const button = document.querySelector(".dropdown-btn");
    const menu = document.querySelector(".dropdown-menu");

    if (dropdown && button && menu) {

        button.addEventListener("click", (e) => {

            e.stopPropagation();

            dropdown.classList.toggle("active");

        });

        document.addEventListener("click", (e) => {

            if (!dropdown.contains(e.target)) {

                dropdown.classList.remove("active");

            }

        });

        menu.addEventListener("click", (e) => {

            e.stopPropagation();

        });

        /*
            FEATURES SUBMENU

            Hovering over "Features" opens the
            submenu to the right.
        */

        const featuresItem = document.querySelector(".features-dropdown");
        const featuresMenu = document.querySelector(".features-menu");

        if (featuresItem && featuresMenu) {

            featuresItem.addEventListener("mouseenter", () => {

                featuresItem.classList.add("active");

            });

            featuresItem.addEventListener("mouseleave", () => {

                featuresItem.classList.remove("active");

            });

        }

    }


    /*
        NAVBAR SCROLL EFFECT
    */

    const navbar = document.querySelector(".navbar");

    if (navbar) {

        window.addEventListener("scroll", () => {

            if (window.scrollY > 15) {

                navbar.style.background = "rgba(11,15,22,.90)";
                navbar.style.boxShadow = "0 10px 35px rgba(0,0,0,.35)";

            } else {

                navbar.style.background = "rgba(11,15,22,.65)";
                navbar.style.boxShadow = "none";

            }

        });

    }


    /*
        FEATURE CARD ANIMATIONS
    */

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

            }

        });

    }, {
        threshold: 0.15
    });


    document.querySelectorAll(".feature-card").forEach(card => {

        card.classList.add("hidden");

        observer.observe(card);

    });


    /*
        SMOOTH ANCHOR SCROLLING
    */

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {

        anchor.addEventListener("click", function (e) {

            e.preventDefault();

            const target = document.querySelector(
                this.getAttribute("href")
            );

            if (target) {

                target.scrollIntoView({
                    behavior: "smooth"
                });

            }

        });

    });


    /*
        ESCAPE KEY
    */

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape") {

            if (dropdown) {
                dropdown.classList.remove("active");
            }

            document
                .querySelectorAll(".features-dropdown")
                .forEach(item => {
                    item.classList.remove("active");
                });

        }

    });


    /*
        ACTIVE DROPDOWN LINK
    */

    const current = window.location.pathname.replace(/\/$/, "");

    document.querySelectorAll(".dropdown-menu a").forEach(link => {

        const href = link.getAttribute("href");

        if (!href) return;

        const normalizedHref = href.replace(/\/$/, "");

        if (normalizedHref === current) {

            link.classList.add("active-link");

        }

    });


    /*
        PAGE LOAD
    */

    window.addEventListener("load", () => {

        document.body.classList.add("loaded");

    });


    /*
        JOIN LOG MODAL
    */

    const joinLogExample =
        document.querySelector(".join-log-reference");

    const joinLogModal =
        document.querySelector("#join-log-modal");

    const closeJoinLogButtons =
        document.querySelectorAll("[data-close-join-log]");


    if (joinLogExample && joinLogModal) {

        const openJoinLog = () => {

            joinLogModal.classList.add("active");

            joinLogModal.setAttribute(
                "aria-hidden",
                "false"
            );

            document.body.classList.add("modal-open");

        };


        const closeJoinLog = () => {

            joinLogModal.classList.remove("active");

            joinLogModal.setAttribute(
                "aria-hidden",
                "true"
            );

            document.body.classList.remove("modal-open");

        };


        joinLogExample.addEventListener(
            "click",
            openJoinLog
        );


        joinLogExample.addEventListener(
            "keydown",
            (e) => {

                if (e.key === "Enter" || e.key === " ") {

                    e.preventDefault();

                    openJoinLog();

                }

            }
        );


        closeJoinLogButtons.forEach(button => {

            button.addEventListener(
                "click",
                closeJoinLog
            );

        });


        document.addEventListener(
            "keydown",
            (e) => {

                if (e.key === "Escape") {

                    closeJoinLog();

                }

            }
        );

    }

});
