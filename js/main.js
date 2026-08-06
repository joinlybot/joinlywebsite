/*
=========================================
 Joinly Website
 main.js
=========================================
*/

document.addEventListener("DOMContentLoaded", () => {

    const dropdown = document.querySelector(".dropdown");
    const button = document.querySelector(".dropdown-btn");

    // Toggle Help dropdown
    button.addEventListener("click", (e) => {

        e.stopPropagation();

        dropdown.classList.toggle("active");

    });

    // Close dropdown when clicking elsewhere
    document.addEventListener("click", (e) => {

        if (!dropdown.contains(e.target)) {

            dropdown.classList.remove("active");

        }

    });

    // Prevent dropdown clicks from bubbling
    const menu = document.querySelector(".dropdown-menu");

    menu.addEventListener("click", (e) => {

        e.stopPropagation();

    });

});

/* ===========================
   Navbar Shadow on Scroll
=========================== */

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

/* ===========================
   Reveal Animation
=========================== */

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

/* ===========================
   Smooth Anchor Links
=========================== */

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

/* ===========================
   ESC closes dropdown
=========================== */

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        document.querySelector(".dropdown").classList.remove("active");

    }

});

/* ===========================
   Active Page Highlight
=========================== */

const current = window.location.pathname.split("/").pop();

document.querySelectorAll(".dropdown-menu a").forEach(link=>{

    const href = link.getAttribute("href");

    if(href === current){

        link.classList.add("active-link");

    }

});

/* ===========================
   Optional Fade-in Hero
=========================== */

window.addEventListener("load", ()=>{

    document.body.classList.add("loaded");

});