/*
==================================================
    MOCK DATA
==================================================
*/

// Default services.
// These are only used the FIRST time the site is opened.

const defaultServices = [
    {
        id: 1,
        name: "DMV Services",
        description: "Apply for or renew a driver's license.",
        duration: 30,
        priority: "high",
        open: true
    },

    {
        id: 2,
        name: "Student Advising",
        description: "Academic Advising for student.",
        duration: 20,
        priority: "medium",
        open: true
    },

    {
        id: 3,
        name: "Financial Aid",
        description: "Ask questions and receive general assistance regarding financial services.",
        duration: 10,
        priority: "low",
        open: false
    }
];


const defaultQueues = {

    1: [
        { id: 101, name: "John Smith", number: "A001" },
        { id: 102, name: "Sarah Johnson", number: "A002" },
        { id: 103, name: "Michael Brown", number: "A003" }
    ],

    2: [
        { id: 201, name: "Emily Davis", number: "B001" },
        { id: 202, name: "David Wilson", number: "B002" }
    ],

    3: [
        { id: 301, name: "Robert Taylor", number: "C001" }
    ]

};


/*
==================================================
    LOAD DATA FROM BROWSER STORAGE
==================================================
*/

// Check whether saved data already exists.

let services =
    JSON.parse(
        localStorage.getItem("adminServices")
    );

let queues =
    JSON.parse(
        localStorage.getItem("adminQueues")
    );


// If this is the first time the site is opened,
// save the default data.

if (!services) {

    services = defaultServices;

    localStorage.setItem(
        "adminServices",
        JSON.stringify(services)
    );

}


if (!queues) {

    queues = defaultQueues;

    localStorage.setItem(
        "adminQueues",
        JSON.stringify(queues)
    );

}


/*
==================================================
    SAVE DATA
==================================================
*/

function saveData() {

    localStorage.setItem(
        "adminServices",
        JSON.stringify(services)
    );

    localStorage.setItem(
        "adminQueues",
        JSON.stringify(queues)
    );

}


/*
==================================================
    DASHBOARD
==================================================
*/

function loadDashboard() {

    const serviceList =
        document.getElementById("serviceList");


    // This page doesn't have the dashboard.
    if (!serviceList) {
        return;
    }


    const totalServices =
        document.getElementById("totalServices");

    const openQueues =
        document.getElementById("openQueues");

    const peopleWaiting =
        document.getElementById("peopleWaiting");


    totalServices.textContent =
        services.length;


    openQueues.textContent =
        services.filter(
            service => service.open
        ).length;


    let totalWaiting = 0;


    services.forEach(service => {

        totalWaiting +=
            queues[service.id]?.length || 0;

    });


    peopleWaiting.textContent =
        totalWaiting;


    serviceList.innerHTML = "";


    services.forEach(service => {

        const queueLength =
            queues[service.id]?.length || 0;


        const div =
            document.createElement("div");


        div.className =
            "queue-item";


        div.innerHTML = `

            <div class="queue-user">

                <strong>
                    ${service.name}
                </strong>

                <small>
                    ${service.description}
                </small>

            </div>

            <div>

                <span class="badge ${service.open ? "open" : "closed"}">

                    ${service.open ? "Open" : "Closed"}

                </span>

            </div>

            <div>
                ${queueLength} waiting
            </div>

            <div class="queue-actions">

                <button
                    class="button secondary"
                    onclick="toggleQueue(${service.id})"
                >
                    ${service.open ? "Close Queue" : "Open Queue"}
                </button>

                <a
                    href="queue.html?service=${service.id}"
                    class="button primary"
                >
                    Manage
                </a>

            </div>
        `;


        serviceList.appendChild(div);

    });

}


/*
==================================================
    OPEN / CLOSE QUEUE
==================================================
*/

function toggleQueue(serviceId) {

    const service =
        services.find(
            service => service.id === serviceId
        );


    if (!service) {
        return;
    }


    service.open =
        !service.open;


    // Save the change.
    saveData();


    // Update dashboard.
    loadDashboard();

}


/*
==================================================
    SERVICE MANAGEMENT
==================================================
*/

let editingServiceId = null;


function loadServiceTable() {

    const table =
        document.getElementById("serviceTable");


    if (!table) {
        return;
    }


    let html = `

        <table>

            <thead>

                <tr>

                    <th>Service</th>
                    <th>Duration</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Actions</th>

                </tr>

            </thead>

            <tbody>

    `;


    services.forEach(service => {

        html += `

            <tr>

                <td>

                    <strong>
                        ${service.name}
                    </strong>

                    <br>

                    <small>
                        ${service.description}
                    </small>

                </td>

                <td>
                    ${service.duration} min
                </td>

                <td>

                    <span class="badge ${service.priority}">

                        ${service.priority}

                    </span>

                </td>

                <td>

                    <span class="badge ${service.open ? "open" : "closed"}">

                        ${service.open ? "Open" : "Closed"}

                    </span>

                </td>

                <td>

                    <button
                        class="button secondary"
                        onclick="editService(${service.id})"
                    >
                        Edit
                    </button>

                </td>

            </tr>

        `;

    });


    html += `

            </tbody>

        </table>

    `;


    table.innerHTML =
        html;

}


/*
==================================================
    CREATE / EDIT SERVICE
==================================================
*/

const serviceForm =
    document.getElementById("serviceForm");


if (serviceForm) {

    serviceForm.addEventListener(
        "submit",
        function(event) {

            event.preventDefault();


            const name =
                document
                    .getElementById("serviceName")
                    .value
                    .trim();


            const description =
                document
                    .getElementById("description")
                    .value
                    .trim();


            const duration =
                Number(
                    document
                        .getElementById("duration")
                        .value
                );


            const priority =
                document
                    .getElementById("priority")
                    .value;


            /*
            ------------------------------------------
                VALIDATION
            ------------------------------------------
            */

            if (!name) {

                alert(
                    "Service name is required."
                );

                return;

            }


            if (name.length > 100) {

                alert(
                    "Service name cannot exceed 100 characters."
                );

                return;

            }


            if (!description) {

                alert(
                    "Description is required."
                );

                return;

            }


            if (!duration || duration < 1) {

                alert(
                    "Expected duration must be at least 1 minute."
                );

                return;

            }


            /*
            ------------------------------------------
                EDIT EXISTING SERVICE
            ------------------------------------------
            */

            if (editingServiceId !== null) {

                const service =
                    services.find(
                        service =>
                            service.id === editingServiceId
                    );


                if (service) {

                    service.name =
                        name;

                    service.description =
                        description;

                    service.duration =
                        duration;

                    service.priority =
                        priority;

                }

            }


            /*
            ------------------------------------------
                CREATE NEW SERVICE
            ------------------------------------------
            */

            else {

                const newId =
                    Date.now();


                services.push({

                    id: newId,

                    name: name,

                    description: description,

                    duration: duration,

                    priority: priority,

                    open: false

                });


                queues[newId] = [];

            }


            /*
            ------------------------------------------
                SAVE
            ------------------------------------------
            */

            saveData();


            clearForm();

            loadServiceTable();

        }
    );

}


/*
==================================================
    EDIT SERVICE
==================================================
*/

function editService(serviceId) {

    const service =
        services.find(
            service => service.id === serviceId
        );


    if (!service) {
        return;
    }


    editingServiceId =
        serviceId;


    document.getElementById(
        "serviceName"
    ).value =
        service.name;


    document.getElementById(
        "description"
    ).value =
        service.description;


    document.getElementById(
        "duration"
    ).value =
        service.duration;


    document.getElementById(
        "priority"
    ).value =
        service.priority;


    document.getElementById(
        "formTitle"
    ).textContent =
        "Edit Service";

}


/*
==================================================
    CLEAR FORM
==================================================
*/

function clearForm() {

    const form =
        document.getElementById(
            "serviceForm"
        );


    if (!form) {
        return;
    }


    form.reset();


    editingServiceId =
        null;


    document.getElementById(
        "formTitle"
    ).textContent =
        "Create Service";

}


/*
==================================================
    QUEUE MANAGEMENT
==================================================
*/

function loadQueueServices() {

    const select =
        document.getElementById(
            "queueService"
        );


    if (!select) {
        return;
    }


    select.innerHTML = "";


    services.forEach(service => {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            service.id;


        option.textContent =
            service.name;


        select.appendChild(option);

    });


    /*
        Check whether a service was selected
        through the URL.
    */

    const params =
        new URLSearchParams(
            window.location.search
        );


    const selectedService =
        params.get("service");


    if (selectedService) {

        select.value =
            selectedService;

    }


    loadQueue();

}


/*
==================================================
    DISPLAY QUEUE
==================================================
*/

function loadQueue() {

    const select =
        document.getElementById(
            "queueService"
        );


    if (!select) {
        return;
    }


    const serviceId =
        Number(select.value);


    const service =
        services.find(
            service => service.id === serviceId
        );


    if (!service) {
        return;
    }


    const queue =
        queues[serviceId] || [];


    document.getElementById(
        "queueTitle"
    ).textContent =
        service.name;


    document.getElementById(
        "queueCount"
    ).textContent =
        `${queue.length} people waiting`;


    const queueList =
        document.getElementById(
            "queueList"
        );


    queueList.innerHTML = "";


    /*
        Empty queue
    */

    if (queue.length === 0) {

        queueList.innerHTML = `

            <p>
                No users are currently waiting.
            </p>

        `;

        return;

    }


    /*
        Display users
    */

    queue.forEach((user, index) => {

        const div =
            document.createElement(
                "div"
            );


        div.className =
            "queue-item";


        div.innerHTML = `

            <div class="queue-position">

                #${index + 1}

            </div>


            <div class="queue-user">

                <strong>
                    ${user.name}
                </strong>

                <small>
                    Queue number: ${user.number}
                </small>

            </div>


            <div class="queue-actions">

                <button
                    class="button secondary"
                    onclick="moveUserUp(${user.id})"
                >
                    ↑
                </button>


                <button
                    class="button secondary"
                    onclick="moveUserDown(${user.id})"
                >
                    ↓
                </button>


                <button
                    class="button danger"
                    onclick="removeUser(${user.id})"
                >
                    Remove
                </button>

            </div>

        `;


        queueList.appendChild(div);

    });

}


/*
==================================================
    GET SELECTED SERVICE
==================================================
*/

function getSelectedServiceId() {

    const select =
        document.getElementById(
            "queueService"
        );


    return Number(
        select.value
    );

}


/*
==================================================
    MOVE USER UP
==================================================
*/

function moveUserUp(userId) {

    const serviceId =
        getSelectedServiceId();


    const queue =
        queues[serviceId];


    const index =
        queue.findIndex(
            user => user.id === userId
        );


    if (index > 0) {

        [
            queue[index - 1],
            queue[index]
        ] =
        [
            queue[index],
            queue[index - 1]
        ];

    }


    saveData();

    loadQueue();

}


/*
==================================================
    MOVE USER DOWN
==================================================
*/

function moveUserDown(userId) {

    const serviceId =
        getSelectedServiceId();


    const queue =
        queues[serviceId];


    const index =
        queue.findIndex(
            user => user.id === userId
        );


    if (
        index !== -1 &&
        index < queue.length - 1
    ) {

        [
            queue[index],
            queue[index + 1]
        ] =
        [
            queue[index + 1],
            queue[index]
        ];

    }


    saveData();

    loadQueue();

}


/*
==================================================
    REMOVE USER
==================================================
*/

function removeUser(userId) {

    const serviceId =
        getSelectedServiceId();


    queues[serviceId] =
        queues[serviceId].filter(
            user => user.id !== userId
        );


    saveData();

    loadQueue();

}


/*
==================================================
    SERVE NEXT USER
==================================================
*/

function serveNext() {

    const serviceId =
        getSelectedServiceId();


    const queue =
        queues[serviceId];


    if (!queue || queue.length === 0) {

        alert(
            "There are no users waiting."
        );

        return;

    }


    const user =
        queue.shift();


    /*
        Save the updated queue.
    */

    saveData();


    alert(
        `${user.name} (${user.number}) is now being served.`
    );


    loadQueue();

}


/*
==================================================
    INITIALIZE THE CURRENT PAGE
==================================================
*/

loadDashboard();

loadServiceTable();

loadQueueServices();
