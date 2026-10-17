(async () => {
    const container = document.getElementById("navbar-container");
    if (!container) return;

    try {
        const scriptUrl = document.currentScript?.src || new URL("/js/navbar.js", window.location.href).href;
        const navbarUrl = new URL("../components/navbar.html", scriptUrl);
        const response = await fetch(navbarUrl);

        if (!response.ok) {
            throw new Error(`Failed to load navbar: ${response.status}`);
        }

        container.innerHTML = await response.text();
        document.dispatchEvent(new Event("joinly-navbar-loaded"));
    } catch (error) {
        console.error("Unable to load the shared Joinly navbar:", error);
    }
})();
