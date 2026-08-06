document.addEventListener("DOMContentLoaded", () => {


    const container = document.getElementById("updates-container");

    const dropdown = document.querySelector(".updates-filter-dropdown");

    const button = document.querySelector(".updates-filter-btn");

    const menu = document.querySelector(".updates-filter-menu");


    if (!container) return;


    let updates = [];

    let currentFilter = "all";



    /*
        Dropdown handling
    */

    if(dropdown && button && menu){


        button.addEventListener("click", (event) => {

            event.stopPropagation();

            dropdown.classList.toggle("active");

        });



        dropdown.addEventListener("click", (event)=>{

            event.stopPropagation();

        });



        document.addEventListener("click", ()=>{

            dropdown.classList.remove("active");

        });


    }





    /*
        Load updates
    */

    fetch("updates.json")

        .then(response => response.json())

        .then(data => {


            updates = data;



            // Newest updates first

            updates.sort((a, b) => {

                return new Date(b.date) - new Date(a.date);

            });



            createFilters();


            renderUpdates();



        })



        .catch(error => {


            console.error("Failed to load updates:", error);



            container.innerHTML = `

            <div class="variable-card update-card">

                <h3>Unable to load updates</h3>

                <p>
                There was an error loading the Joinly development log.
                </p>

            </div>

            `;


        });






    /*
        Create dropdown categories
    */

    function createFilters(){


        if(!menu) return;



        const types = [
            ...new Set(
                updates.map(update => update.type)
            )
        ];



        types.forEach(type => {



            const option = document.createElement("a");

            option.dataset.filter = type;



            option.innerHTML = `

            <div>

                <h4>${type}</h4>

                <p>Show only ${type} updates.</p>

            </div>

            `;



            option.addEventListener("click", ()=>{


                currentFilter = type;


                updateButton(type);


                dropdown.classList.remove("active");


                renderUpdates();



            });



            menu.appendChild(option);



        });




        const allOption = menu.querySelector(
            '[data-filter="all"]'
        );



        if(allOption){


            allOption.addEventListener("click", ()=>{


                currentFilter = "all";


                updateButton("All Updates");


                dropdown.classList.remove("active");


                renderUpdates();



            });


        }


    }






    /*
        Update dropdown button text
    */

    function updateButton(text){


        if(!button) return;



        button.innerHTML = `

        ${text}

        <svg width="14" height="14" viewBox="0 0 24 24">

        <path fill="currentColor" d="M7 10l5 5 5-5z"/>

        </svg>

        `;


    }






    /*
        Render updates
    */

    function renderUpdates(){


        container.innerHTML = "";



        let filteredUpdates = updates;



        if(currentFilter !== "all"){


            filteredUpdates = updates.filter(update =>

                update.type === currentFilter

            );


        }





        filteredUpdates.forEach(update => {



            const card = document.createElement("div");


            // KEEP ORIGINAL CSS CLASSES

            card.className = "variable-card update-card";



            card.innerHTML = `


            <div class="update-header">


                <div>


                    <h3>${update.title}</h3>


                    <span>${update.date}</span>


                </div>



                <span class="badge">

                    ${update.type}

                </span>


            </div>



            ${
                Array.isArray(update.content)
                ? update.content.join("<br>")
                : update.content
            }



            `;



            container.appendChild(card);



        });





        if(filteredUpdates.length === 0){


            container.innerHTML = `

            <div class="variable-card update-card">

                <h3>No updates found</h3>

                <p>
                There are no updates in this category.
                </p>

            </div>

            `;


        }



    }



});
