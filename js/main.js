document.addEventListener("DOMContentLoaded", () => {

    const dropdown = document.querySelector(".dropdown");
    const button = document.querySelector(".dropdown-btn");

    button.addEventListener("click", (e) => {

        e.stopPropagation();

        dropdown.classList.toggle("active");

    });

    document.addEventListener("click", (e) => {

        if (!dropdown.contains(e.target)) {

            dropdown.classList.remove("active");

        }

    });

    const menu = document.querySelector(".dropdown-menu");

    menu.addEventListener("click", (e) => {

        e.stopPropagation();

    });

});

const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {

    if(window.scrollY > 15){

        navbar.style.background = "rgba(11,15,22,.90)";
        navbar.style.boxShadow = "0 10px 35px rgba(0,0,0,.35)";

    }

    else{

        navbar.style.background = "rgba(11,15,22,.65)";
        navbar.style.boxShadow = "none";

    }

});

const observer = new IntersectionObserver((entries)=>{

    entries.forEach(entry=>{

        if(entry.isIntersecting){

            entry.target.classList.add("visible");

        }

    });

},{
    threshold:.15
});

document.querySelectorAll(".feature-card").forEach(card=>{

    card.classList.add("hidden");

    observer.observe(card);

});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {

    anchor.addEventListener("click", function(e){

        e.preventDefault();

        const target = document.querySelector(this.getAttribute("href"));

        if(target){

            target.scrollIntoView({

                behavior:"smooth"

            });

        }

    });

});

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        document.querySelector(".dropdown").classList.remove("active");

    }

});

const current = window.location.pathname.split("/").pop();

document.querySelectorAll(".dropdown-menu a").forEach(link=>{

    const href = link.getAttribute("href");

    if(href === current){

        link.classList.add("active-link");

    }

});

window.addEventListener("load", ()=>{

    document.body.classList.add("loaded");

});

const joinLogExample = document.querySelector(".join-log-reference");
const joinLogModal = document.querySelector("#join-log-modal");
const closeJoinLogButtons = document.querySelectorAll("[data-close-join-log]");

if (joinLogExample && joinLogModal) {

    const openJoinLog = () => {

        joinLogModal.classList.add("active");
        joinLogModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");

    };

    const closeJoinLog = () => {

        joinLogModal.classList.remove("active");
        joinLogModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");

    };

    joinLogExample.addEventListener("click", openJoinLog);

    joinLogExample.addEventListener("keydown", (e) => {

        if (e.key === "Enter" || e.key === " ") {

            e.preventDefault();
            openJoinLog();

        }

    });

    closeJoinLogButtons.forEach(button => {

        button.addEventListener("click", closeJoinLog);

    });

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape") {

            closeJoinLog();

        }

    });

}
