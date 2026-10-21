document.addEventListener("DOMContentLoaded", () => {

    const container =
        document.getElementById("history-container");

    if (!container) return;

    fetch("/history.json")

        .then(response => {

            if (!response.ok) {
                throw new Error("Failed loading history.json");
            }

            return response.json();

        })

        .then(data => {

            if (!data.incidents || data.incidents.length === 0) {

                container.innerHTML = `

                <div class="status-card">

                    <p>
                    No incidents have been recorded.
                    </p>

                </div>

                `;

                return;

            }

            data.incidents.forEach(incident => {

                const card =
                    document.createElement("div");

                card.className =
                    "status-history-card";

                const statusClass =
                    incident.status
                        .toLowerCase()
                        .replace(" ", "-");

                card.innerHTML = `

                <div class="history-header">

                    <div>

                        <h3>
                            ${incident.service}
                        </h3>

                        <span>
                            ${incident.date}
                        </span>

                    </div>

                    <div class="history-status ${statusClass}">

                        ${incident.status}

                    </div>

                </div>

                <p class="history-description">

                    ${incident.description}

                </p>

                <div class="history-footer">

                    <span>

                        <strong>Duration:</strong> ${
                            incident.resolved
                                ? incident.duration
                                : "Ongoing"
                        }

                    </span>

                    <span>

                        <strong>Status:</strong> ${
                            incident.resolved
                                ? "Resolved"
                                : "Active Incident"
                        }

                    </span>

                </div>

                `;

                container.appendChild(card);

            });

        })

        .catch(error => {

            console.error(
                "Failed to load status history:",
                error
            );

            container.innerHTML = `

            <div class="status-card">

                <p>
                Unable to load status history.
                </p>

            </div>

            `;

        });

});
