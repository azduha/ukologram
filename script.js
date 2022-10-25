var data = {
    tasks: {},
    connections: {},
    tags: {},
    assignees: {},
    notify: {},
}

var taskHistory = [];

// CONFIG
var timeApi = 200;
var mapSize = 50000;
var longLineOffset = 3000;
var title = "Úkologram";
var dragChildren = false;
// CONFIG

var version = 0; // version stamp for API
var nickname = "";
var boardId = 1;
var boardName = "";
var userID = 0;
var mouseX = 0;
var mouseY = 0;
var origX = 0;
var origY = 0;
var finalX = 0;
var finalY = 0;
var targetTask = null;
var removingLine = null;
var md = new Remarkable();
var fullscreenTask = null;
var editedTask = null;
var timer = null;
var lineCreationProgress = 0;
var isEditing = {
    drag: false,
    title: false,
    content: false,
    connection: false
}
var menu = 0;
var filter = {
    assignees: [],
    tags: [],
    fulltext: ""
}
var responseReceived = true;

var foundItems = [];

const localStorage = window.localStorage;
var allNotifications = false;
var listView = false;
var allColumns = true;
if (localStorage) {
    const storageAllNotifications = localStorage.getItem('ukologram.allNotifications');
    if (storageAllNotifications !== null) {
        allNotifications = storageAllNotifications == "true";
    }
    const storageListView = localStorage.getItem('ukologram.listView');
    if (storageListView !== null) {
        listView = storageListView == "true";
    }
    const storageAllColumns = localStorage.getItem('ukologram.allColumns');
    if (storageAllColumns !== null) {
        allColumns = storageAllColumns == "true";
    }
}


function mindmapInit(size, nick, board) {
    mapSize = size;
    nickname = nick;
    boardId = board;
    askApi();
    manageUpdateTimer();

    if (getMobileOperatingSystem()) {
        document.body.classList.add("mobile");
    } else {
        document.body.classList.remove("mobile");
    }

    setMode();

    document.getElementById("taskDetailTitle").addEventListener('click', editTitle);
}

function parseApi(data) {
    json = JSON.parse(data);

    result = {
        tasks: {},
        connections: {},
        tags: {},
        assignees: {},
        notify: {},
    }

    const taskReducer = (accumulator, currentValue) => {
        accumulator[currentValue.id] = {
            title: currentValue.title,
            content: currentValue.content,
            image: currentValue.image,
            status: parseInt(currentValue.status),
            location: {
                x: parseInt(currentValue.location_x) + mapSize/2,
                y: parseInt(currentValue.location_y) + mapSize/2
            },
            assignee: [],
            tags: [],
            notify: []
        };
        return accumulator;
    };

    const connectionReducer = (accumulator, currentValue) => {
        accumulator[currentValue.id] = {
            from: currentValue.from_id,
            to: currentValue.to_id,
            id: currentValue.id
        };
        return accumulator;
    };

    const reducer = (accumulator, currentValue) => {
        accumulator[currentValue.id] = currentValue;
        return accumulator;
    };

    result.tasks = json.gram_task.reduce(taskReducer, {});
    result.connections = json.gram_connection.reduce(connectionReducer, {});
    result.assignees = json.gram_assignee.reduce(reducer, {});
    result.tags = json.gram_tag.reduce(reducer, {});
    result.notify = json.gram_notify.reduce(reducer, {});

    json.gram_task_tag.forEach((o) => {
        if (result.tasks[o.id_task]) {
            if (result.tags[o.id_tag]) {
                result.tasks[o.id_task].tags.push(parseInt(o.id_tag));
            }
        }
    });
    json.gram_task_assignee.forEach((o) => {
        if (result.tasks[o.id_task]) {
            if (result.assignees[o.id_assignee]) {
                result.tasks[o.id_task].assignee.push(parseInt(o.id_assignee));
            }
        }
    });
    json.gram_notify.forEach((o) => {
        if (result.tasks[o.task_id]) {
            result.tasks[o.task_id].notify.push(parseInt(o.id));
        }
    });

    var possibleUsers = Object.values(result.assignees).filter((e) => {
        return e.nickname == nickname;
    })

    if (possibleUsers.length > 0) {
        userID = possibleUsers[0].id;
    } else {
        userID = 0;
    }

    return result;
}

function parseApiOnline(jsonData) {
    json = JSON.parse(jsonData);

    json.gram_assignee.forEach((o) => {
        if (data && data.assignees && data.assignees[o.id]) {
            data.assignees[o.id].last_online = o.last_online;
            data.assignees[o.id].last_x = parseInt(o.last_x);
            data.assignees[o.id].last_y = parseInt(o.last_y);
        }
    })
}

function askApi() {
    if (responseReceived) {
        if (!targetTask) {
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "api/all?timestamp=" + (Date.now()), true);
            xhr.onload = function (e) {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        // Parse it only if there's a change
                        var newVersion = parseInt(JSON.parse(xhr.responseText)["version"]);
                        if (newVersion != version) {
                            version = newVersion;
                            boardName = JSON.parse(xhr.responseText)["board_id"];
                            data = parseApi(xhr.responseText);
                            update();
                        } else {
                            parseApiOnline(xhr.responseText);
                            updateOnline();
                        }

                        //console.log("api/all", data);
                    } else {
                        console.error(xhr.statusText);
                    }
                    responseReceived = true;
                }
            };
            xhr.onerror = function (e) {
                console.error(xhr.statusText);
            };
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify({
                "version": version,
                "nickname": nickname,
                "x": -posX,
                "y": -posY,
                "board_id": boardId,
            }));
            responseReceived = false;
        }
    }
}

function sendApi(jsonData, service, refresh = false) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", service);
    xhr.onload = function (e) {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                console.log(service, jsonData);
                if (refresh) { update(); }
            } else {
                console.error(xhr.statusText);
                console.log(xhr.responseText);
            }
        }
    };
    xhr.onerror = function (e) {
        console.error(xhr.statusText);
    };
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonData));
}

function notifyUsers(taskId, users, type, note) {
    var jsonData = {
        "table": "gram_notify",
        // "values": Object.keys(users).filter((o) => { return o != userID; }).map((o) => {
        "values": Object.keys(data.assignees).filter((o) => { return o != userID; }).map((o) => {
            return {
                "assignee_id": o,
                "task_id": taskId,
                "type": type,
                "author_id": userID,
                "note": note,
                "board_id": boardId,
            }
        }).concat(
            [ {
                "assignee_id": "0",
                "task_id": taskId,
                "type": type,
                "author_id": userID,
                "note": note,
                "board_id": boardId,
            } ]
        )
    };

    sendApi(jsonData, "api/insert", false);
}

function notifyClear(taskId) {
    var jsonData = {
        "table": "gram_notify",
        "where": {
            "task_id": taskId,
            "assignee_id": userID,
            "board_id": boardId,
        }
    };

    sendApi(jsonData, "api/delete", false);
}

function notifyClearAll() {
    var jsonData = {
        "table": "gram_notify",
        "where": {
            "assignee_id": userID,
            "board_id": boardId,
        }
    };

    sendApi(jsonData, "api/delete", false);
}

function updateTaskApi(taskId, values, notify, note = "") {
    var jsonData = {
        "table": "gram_task",
        "values": values,
        "where": {
            "id": taskId,
            "board_id": boardId,
        }
    };

    sendApi(jsonData, "api/update", false);
    if (notify > 0) {
        notifyUsers(taskId, data.tasks[taskId].assignee, notify, note);
    }
}

function removeAttributesApi(attribute, taskId, attributeId) {
    var jsonData = {
        "table": "gram_task_" + attribute,
        "where": {
            "id_task": taskId,
            ["id_" + attribute]: attributeId,
            "board_id": boardId,
        }
    };

    sendApi(jsonData, "api/delete", false);
    notifyUsers(taskId, data.tasks[taskId].assignee, attribute == "assignee" ? 5 : 7, attributeId);
}

function addAttributesApi(attribute, taskId, attributeId) {
    var jsonData = {
        "table": "gram_task_" + attribute,
        "values": [
            {
                "id_task": taskId,
                ["id_" + attribute]: attributeId,
                "board_id": boardId,
            }
        ]
    };

    sendApi(jsonData, "api/insert", false);
    notifyUsers(taskId, data.tasks[taskId].assignee, attribute == "assignee" ? 4 : 6, attributeId);
}

function createTaskApi(values) {
    var jsonData = {
        "table": "gram_task",
        "values": [ values ],
    };

    sendApi(jsonData, "api/insert", true);
}

function createLineApi(values) {
    var jsonData = {
        "table": "gram_connection",
        "values": [ values ]
    };

    sendApi(jsonData, "api/insert", true);
}

function deleteLineApi(lineId) {
    var jsonData = {
        "table": "gram_connection",
        "where": {
            "id": lineId,
            "board_id": boardId
        }
    };

    sendApi(jsonData, "api/delete", true);
}

function getHistory(taskId) {
    var jsonData = {
        "id": taskId,
        "board_id": boardId,
    };

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "api/history");
    xhr.onload = function (e) {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                console.log("api/history", jsonData);
                taskHistory = JSON.parse(xhr.responseText)["gram_notify"];
                updateHistory();
            } else {
                console.error(xhr.statusText);
                console.log(xhr.responseText);
            }
        }
    };
    xhr.onerror = function (e) {
        console.error(xhr.statusText);
    };
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonData));
}


// Updates mindmap plot (edits existing nodes, adds new ones, remove old ones)
function mindmapUpdate() {
    var tasks = document.getElementsByClassName("task");
    for (var i = 0; i < tasks.length; i++) {
        tasks[i].classList.add("update");
    }

    var connections = document.getElementsByClassName("taskConnection");
    for (var i = 0; i < connections.length; i++) {
        connections[i].classList.add("update");
    }

    var canvas = document.getElementById("planeCanvas");
    var svg = document.getElementById("planeSVG");

    // Tasks part
    for (var key in data.tasks) {
        var oldObject = document.getElementById("task-" + key);
        if (!oldObject) {
            /*
            <div id="task-1" class="task status-yellow" style="top: 5000px; left: 5000px;">
                <div class="taskTitle">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </div>
                <div class="taskIcon"></div>
                <div class="taskDraggable"></div>
                <div class="taskSubtitle">
                    <span class="text-gray">Assignee:</span> Sony, Míra, Heri, Kadli
                </div>
            </div>
            */
            canvas.appendChild(generateTask(key, "task", ""));

            oldObject = document.getElementById("task-" + key);
        }
        setTaskData(key, oldObject, "task");

        oldObject.style.left = data.tasks[key].location.x + "px";
        oldObject.style.top = data.tasks[key].location.y + "px";

        oldObject.classList.remove("update");
    }

    // Connections part
    for (var key in data.connections) {
        var oldObject = document.getElementById("connection-" + key);
        var t1 = data.tasks[data.connections[key].from];
        var t2 = data.tasks[data.connections[key].to];

        if (t1 && t2) {
            if (!oldObject) {
                /*
                <path id="connection-1" d="M5000 5000 L4750 5000 L4500 5000 Z" class="taskConnection" marker-mid="url(#arrow)"/>
                */
                var newObject = document.createElementNS('http://www.w3.org/2000/svg','path');
                newObject.id = "connection-" + key;
                newObject.classList.add("taskConnection");
                newObject.setAttribute('onmousedown', "deleteLine(" + key + ");");
                svg.appendChild(newObject);

                oldObject = document.getElementById("connection-" + key);
            }
            setPath(oldObject, t1.location.x, t1.location.y, t2.location.x, t2.location.y);
            oldObject.setAttribute("marker-mid", "url(#arrow)");
            oldObject.classList.remove("update");
        }
    }

    var removed = document.getElementsByClassName("update");
    for (var i = 0; i < removed.length; i++) {
        removed[i].parentNode.removeChild(removed[i]);
    }
}

function generateTask(key, className = "task", id = "", dragg = true) {
    var newObject = document.createElement("div");
    newObject.id = "task-" + key + id;
    newObject.className = className;
    var taskTitle = document.createElement("div");
    taskTitle.classList.add("taskTitle");
    taskTitle.setAttribute('onclick', "showDetail(" + key + ");");
    var taskIcon = document.createElement("div");
    taskIcon.classList.add("taskIcon");
    taskIcon.setAttribute('onclick', "showDetail(" + key + ");");
    if (dragg) {
        var taskDraggable = document.createElement("div");
        taskDraggable.classList.add("taskDraggable");
        taskDraggable.addEventListener('mousedown', mouseDownTask);
        newObject.appendChild(taskDraggable);
    }
    var taskSubtitle = document.createElement("div");
    taskSubtitle.classList.add("taskSubtitle");
    var taskInfo = document.createElement("div");
    taskInfo.classList.add("taskInfo");
    newObject.appendChild(taskTitle);
    newObject.appendChild(taskIcon);
    newObject.appendChild(taskInfo);
    newObject.appendChild(taskSubtitle);
    newObject.setAttribute('onmousedown', "finishLineCreation(" + key + ");");

    return newObject;
}

function setTaskData(taskId, object, className) {
    object.getElementsByClassName("taskTitle")[0].innerHTML = encodeStr(data.tasks[taskId].title);

    if (data.tasks[taskId].image) {
        object.getElementsByClassName("taskTitle")[0].innerHTML += "<img class='preview' src='" + data.tasks[taskId].image + "' />";
    }

    var subtitle = object.getElementsByClassName("taskSubtitle")[0];
    generateTagsOrAssignees(true, taskId, subtitle, true, false);
    generateTagsOrAssignees(false, taskId, subtitle, false, false);

    var info = object.getElementsByClassName("taskInfo")[0];
    info.innerHTML = '';
    if (data.tasks[taskId].content != '') {
        info.innerHTML += '<div class="info-icon fa fa-align-left" title="Obsahuje popis"></div>';
    }
    var notifications = getRelatedNotifications(data.tasks[taskId].notify.map((n) => data.notify[n])).length;
    if (notifications > 0) {
        info.innerHTML += '<div class="notifications">' + notifications + '</div>';
    }

    object.className = className;
    object.classList.add("status-" + gerStatusColor(data.tasks[taskId].status));
    if (!shouldDisplay(taskId)) {
        object.classList.add("disabled");
    }
}

function intersect(a, b) {
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}

// ----------------------- Handles dragging tasks ---------------------------
function mouseDownTask(event) {
    event.preventDefault();

    isEditing.drag = true;
    manageUpdateTimer();

    document.addEventListener('mouseup', mouseUpTask);
    document.addEventListener('mousemove', mouseMoveTask);

    mouseX = event.clientX;
    mouseY = event.clientY;
    targetTask = event.target.parentElement;
    taskId = getIdFromElement(targetTask);
    origX = parseInt(data.tasks[taskId].location.x);
    origY = parseInt(data.tasks[taskId].location.y);

    finalX = (event.clientX - mouseX)/currentScale + origX;
    finalY = (event.clientY - mouseY)/currentScale + origY;
}

function mouseUpTask(event) {
    event.preventDefault();

    var id = getIdFromElement(targetTask)
    var task = data.tasks[id];

    task.location.x = finalX;
    task.location.y = finalY;

    updateTaskApi(id, {
        "location_x": task.location.x - mapSize/2,
        "location_y": task.location.y - mapSize/2,
    }, 0);

    if (dragChildren) {
        var diffX = finalX - origX;
        var diffY = finalY - origY;

        var childNodes = new Set([id]);

        var finish = false;

        while(!finish) {
            finish = true;
            Object.values(data.connections).forEach((o) => {
                if (childNodes.has(parseInt(o.to)) && !childNodes.has(parseInt(o.from))) {
                    childNodes.add(parseInt(o.from));
                    finish = false;
                }
            })
        }

        childNodes.forEach((i) => {
            if (data.tasks[i] && i != id) {
                updateTaskApi(i, {
                    "location_x": (data.tasks[i].location.x + diffX) - mapSize/2,
                    "location_y": (data.tasks[i].location.y + diffY) - mapSize/2,
                }, 0);
            }
        })
    }

    targetTask = null;
    isEditing.drag = false;
    manageUpdateTimer();

    document.removeEventListener('mouseup', mouseUpTask);
    document.removeEventListener('mousemove', mouseMoveTask);
}

function mouseMoveTask(event) {
    var id = getIdFromElement(targetTask)
    var task = data.tasks[id];

    var x = (event.clientX - mouseX)/currentScale + origX;
    var y = (event.clientY - mouseY)/currentScale + origY;
    finalX = x;
    finalY = y;

    targetTask.style.left = x + "px";
    targetTask.style.top = y + "px";

    for (var key in data.connections) {
        var connection = data.connections[key];

        if (connection.from == id || connection.to == id) {
            var from;
            var to;
            if (connection.from == id) {
                if (data.tasks[connection.to]) {
                    from = {x: x, y: y};
                    to = data.tasks[connection.to].location;
                }
            }
            if (connection.to == id) {
                if (data.tasks[connection.from]) {
                    to = {x: x, y: y};
                    from = data.tasks[connection.from].location;
                }
            }

            var object = document.getElementById("connection-" + key);

            if (from && to && object) {
                setPath(document.getElementById("connection-" + key), from.x, from.y, to.x, to.y);
            }
        }
    }
}
// ----------------------- Handles dragging tasks --(end)--------------------


// Sets path from start and end point (with middle point for arrow)
function setPath(path, x1, y1, x2, y2) {
    var xm = ((x2 - x1)/2 + x1);
    var ym = ((y2 - y1)/2 + y1);

    

    var length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    if (length >= longLineOffset) {
        path.classList.add("long");

        path.setAttribute("d",
            "M"  + x1 +
            " "  + y1 +
            " L" + (x1 + xm)/2 +
            " "  + (y1 + ym)/2 +
            " L" + xm +
            " "  + ym +
            " L" + (x2 + xm)/2 +
            " "  + (y2 + ym)/2 +
            " L" + x2 +
            " "  + y2 +
            "Z"
        );
    } else {
        path.classList.remove("long");

        path.setAttribute("d",
            "M"  + x1 +
            " "  + y1 +
            " L" + xm +
            " "  + ym +
            " L" + x2 +
            " "  + y2 +
            "Z"
        );
    }
}

function closeDetail() {
    document.getElementById("overlayContainer").classList.add("hidden");
    fullscreenTask = null;
    window.location.hash = "";
    lastHash = "";
}

function showDetail(taskId) {
    if (!isEditing.connection) {
        window.location.hash = "#" + taskId;
        lastHash = "#" + taskId;
        fullscreenTask = taskId;
        updateDetail();
        notifyClear(taskId);
    }
}

function updateHistory() {
    if (taskHistory && taskHistory.length > 0 && parseInt(taskHistory[0].task_id) == fullscreenTask) {
        document.getElementById("data-history").innerHTML = taskHistory.map((h) => {
            var title = "";

            var note = h.note;
            var noteNum = parseInt(h.note);

            var authorId = parseInt(h.author_id);
            var author = "<strong>" + ((data.assignees[authorId]) ? data.assignees[authorId].title : "Někdo, kdo nejede na tábor") + "</strong>";
            
            switch (parseInt(h.type)) {
                case 1:
                    var original = "<strong>" + note + "</strong>";
                    title = author + " změnil nadpis na " + original;
                    break;
                
                case 2:
                    title = author + " změnil obsah";
                    break;
                case 3:
                    var type = "";
                    switch (noteNum) {
                        case 0: type = "Kdopak si mě vezme?"; break;
                        case 1: type = "Kde nic, tu nic"; break;
                        case 2: type = "Makám na tom!"; break;
                        case 3: type = "Mám to hotové!"; break;
                        case 4: type = "Až na táboře..."; break;
                    }
                    type = "<strong>" + type + "</strong>";
                    title = author + " změnil stav na " + type;
                    break;
                case 4:
                    var type = data.assignees[noteNum] ? ("<strong>" + data.assignees[noteNum].title + "</strong>"):"<strong>který už není v systému</strong>";
                    title = author + " přidal umpalumpu " + type;
                    break;
                case 5:
                    var type = data.assignees[noteNum] ? ("<strong>" + data.assignees[noteNum].title + "</strong>"):"<strong>který už není v systému</strong>";
                    title = author + " odebral umpalumpu " + type;
                    break;
                case 6:
                    var type = data.tags[noteNum] ? ("<strong>" + data.tags[noteNum].title + "</strong>"):"<strong>který už neexistuje</strong>";
                    title = author + " přidal štítek " + type;
                    break;
                case 7:
                    var type = data.tags[noteNum] ? ("<strong>" + data.tags[noteNum].title + "</strong>"):"<strong>který už neexistuje</strong>";
                    title = author + " odebral štítek " + type;
                    break;
                default:
                    title = author + " je hacker a pohrával si s tímhle úkolem";
            }

            return `
            <div class="history">
                ${title}
                <div class="subtitle">${h.timestamp}</div>
            </div>
            `
        }).join("");
    } else {
        document.getElementById("data-history").innerHTML = "";
    }
}

function updateDetail() {
    if (fullscreenTask) {
        getHistory(fullscreenTask);

        var t = data.tasks[fullscreenTask]

        document.getElementById("data-title").innerHTML = encodeStr(t.title);
        document.getElementById("data-content").innerHTML = md.render(t.content) +
            '<div class="fa fa-edit" id="editContentIcon" onclick="editContent();"></div>';

        generateTagsOrAssignees(true, fullscreenTask, document.getElementById("data-assignee"), true, true);
        generateTagsOrAssignees(false, fullscreenTask, document.getElementById("data-tags"), true, true);

        document.getElementById("data-status").className = "status-" + gerStatusColor(t.status);

        document.getElementById("overlayContainer").classList.remove("hidden");

        var prereq = document.getElementById("data-prerequisities");
        var succ = document.getElementById("data-successors");
        prereq.innerHTML = "";
        succ.innerHTML = "";

        for (var key in data.connections) {
            var connection = data.connections[key];
            if (connection.to == fullscreenTask) {
                if (data.tasks[connection.from]) {
                    prereq.appendChild(generateTask(connection.from, "taskDetailPrerequisite", "-prereq", false));
                    setTaskData(connection.from, document.getElementById("task-" + connection.from + "-prereq"), "taskDetailPrerequisite");
                }
            }
            if (connection.from == fullscreenTask) {
                if (data.tasks[connection.to]) {
                    succ.appendChild(generateTask(connection.to, "taskDetailPrerequisite", "-succ", false));
                    setTaskData(connection.to, document.getElementById("task-" + connection.to + "-succ"), "taskDetailPrerequisite");
                }
            }
        }

        updateHistory();
    }
}

function getIdFromElement(element) {
    var id = parseInt(element.id.replace("task-", ""));
    if (id) { return id; }

    id = parseInt(element.id.replace("connection-", ""));
    if (id) { return id; }

    return 0;
}

function generateTagsOrAssignees(assignee, taskId, element, clear = true, detail = false) {
    var task = data.tasks[taskId];

    if (clear) { element.innerHTML = ""; }
    for (var key in (assignee ? task.assignee : task.tags)) {
        var tagData = assignee ? data.assignees[task.assignee[key]] : data.tags[task.tags[key]];

        if (!tagData) {
            console.error((assignee?"assignee":"tag") + " undefined", task, key, data);
            return;
        }

        var tag = document.createElement("div");
        tag.classList.add(assignee?"assignee":"tag");
        tag.innerHTML = tagData.title;
        if (!assignee) {
            tag.style.background = tagData.color;
            tag.style.color = lightOrDark(tagData.color);
        }
        if (detail) {
            tag.classList.add("removable");
            tag.setAttribute("onclick", "editTagOrAssignee(" + assignee + ", false, " + taskId + ", " + (assignee ? task.assignee[key] : task.tags[key]) + ")");
        }
        element.appendChild(tag);
    }

    if (detail) {
        for (var strKey in (assignee ? data.assignees : data.tags)) {
            var key = parseInt(strKey);
            //console.log(assignee, task.assignee.indexOf(key) != -1, task.assignee, assignee, task.tags.indexOf(key) != -1, task.tags, key);
            if (!(assignee && task.assignee.includes(key) || !assignee && task.tags.includes(key))) {
                var tagData = assignee ? data.assignees[key] : data.tags[key];

                if (!tagData) {
                    console.error((assignee?"assignee":"tag") + " undefined", task, key, data);
                    return;
                }
        
                var tag = document.createElement("div");
                tag.classList.add(assignee?"assignee":"tag");
                tag.innerHTML = tagData.title;
                if (!assignee) {
                    tag.style.background = tagData.color;
                    tag.style.color = lightOrDark(tagData.color);
                }
                if (detail) {
                    tag.classList.add("add");
                    tag.setAttribute("onclick", "editTagOrAssignee(" + assignee + ", true, " + taskId + ", " + key + ")");
                }
                element.appendChild(tag);

            }
        }
    }
}

function lightOrDark(color) {
    // Variables for red, green, blue values
    var r, g, b, hsp;

    // Check the format of the color, HEX or RGB?
    if (color.match(/^rgb/)) {

        // If HEX --> store the red, green, blue values in separate variables
        color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);

        r = color[1];
        g = color[2];
        b = color[3];
    }
    else {

        // If RGB --> Convert it to HEX: http://gist.github.com/983661
        color = +("0x" + color.slice(1).replace(
        color.length < 5 && /./g, '$&$&'));

        r = color >> 16;
        g = color >> 8 & 255;
        b = color & 255;
    }

    // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
    hsp = Math.sqrt(
    0.299 * (r * r) +
    0.587 * (g * g) +
    0.114 * (b * b)
    );

    // Using the HSP value, determine whether the color is light or dark
    if (hsp>127.5) {

        return '#252525';
    }
    else {

        return '#ffffff';
    }
}

function startUpdate() {
    timer = setInterval(askApi, timeApi);
}

function stopUpdate() {
    clearInterval(timer);
    timer = null;
}

function manageUpdateTimer() {
    var b = Object.values(isEditing).reduce((accumulator, currentValue) => currentValue || accumulator);

    //console.log(isEditing, b, timer);

    if (b) {
        if (timer != null) {
            stopUpdate();
        }
    } else {
        if (timer == null) {
            startUpdate();
        }
    }
}

function gerStatusColor(status) {
    switch(status) {
        case 0:
            return "blue";
        case 2:
            return "yellow";
        case 3:
            return "green";
        case 1:
            return "red";
        case 4:
            return "black";
    }
}

function editTitle(event) {
    if (isEditing.title || isEditing.content) {
        return;
    }

    var target = document.getElementById("data-title");
    editedTask = fullscreenTask;

    isEditing.title = true;
    manageUpdateTimer();

    //console.log("edit title start");

    target.innerHTML = "";

    var input = document.createElement("input");
    input.setAttribute("type", "text");
    input.className = "inputEdit";
    input.id = "title-edit";
    input.value = data.tasks[editedTask].title;
    target.appendChild(input);
    var result = document.getElementById("title-edit");

    setTimeout(() => {
        result.setSelectionRange(0, result.value.length);
        result.focus();
    }, 100);

    setTimeout(() => {
        result.addEventListener('blur', (event) => {
            if (isEditing.title) {
                //console.log("edit title end", event.target);

                isEditing.title = false;
                manageUpdateTimer();
                if (data.tasks[editedTask].title != event.target.value) {
                    updateTaskApi(editedTask, {
                        "title": event.target.value,
                    }, 1, event.target.value);

                    data.tasks[editedTask].title = event.target.value;
                }
                update();
            }
        });
    }, 200);
}

function editContent() {
    if (isEditing.content || isEditing.title) {
        return;
    }

    var target = document.getElementById("data-content");
    editedTask = fullscreenTask;

    isEditing.content = true;
    manageUpdateTimer();

    target.innerHTML = "";

    var input = document.createElement("textarea");
    input.className = "inputEdit";
    input.id = "content-edit";
    input.value = data.tasks[editedTask].content;
    target.appendChild(input);
    var result = document.getElementById("content-edit");

    setTimeout(() => {
        //result.setSelectionRange(0, result.value.length);
        result.focus();
    }, 100);

    setTimeout(() => {
        result.addEventListener('blur', (event) => {
            if (isEditing.content) {
                isEditing.content = false;
                manageUpdateTimer();

                if (data.tasks[editedTask].content != event.target.value) {
                    data.tasks[editedTask].content = event.target.value;

                    updateTaskApi(editedTask, {
                        "content": data.tasks[editedTask].content,
                    }, 2);
                }
                update();
            }
        });
    }, 200);
}

function editTagOrAssignee(assignee, add, task, id) {
    //console.log(task);

    if (!(isEditing.content || isEditing.title)) {

        if (add) {
            if (assignee) {
                data.tasks[task].assignee.push(id);
                addAttributesApi("assignee", task, id);
            } else {
                data.tasks[task].tags.push(id);
                addAttributesApi("tag", task, id);
            }
        } else {
            if (assignee) {
                data.tasks[task].assignee = remove(data.tasks[task].assignee, id);
                removeAttributesApi("assignee", task, id);
            } else {
                data.tasks[task].tags = remove(data.tasks[task].tags, id);
                removeAttributesApi("tag", task, id);
            }
        } 
        
        update();
    }
}

function remove (array, value) {
    var index = array.indexOf(value);
    if (index > -1) {
        array.splice(index, 1);
    }
    return array
}

function update() {
    updateDetail();
    mindmapUpdate();
    updateNotifications();
    updateFilters();
    updateOnline();
    updateList();

    var buttonFilter = document.getElementById("buttonFilter");
    if (filter.tags.length > 0 || filter.assignees.length > 0 || filter.fulltext.length > 0) {
        buttonFilter.classList.add("dot")
    } else {
        buttonFilter.classList.remove("dot")
    }
}

function updateOnline() {
    var offlineInterval = 5*1000;
    var result = [];

    var canvas = document.getElementById("planeCanvas");

    Object.values(data.assignees).forEach((o) => {
        var obj = document.getElementById("user-" + o.title);

        if (!obj) {
            var newObject = document.createElement("div");
            newObject.id = "user-" + o.title;
            newObject.classList.add("otherUser");
            newObject.title = o.title;
            canvas.appendChild(newObject);

            obj = document.getElementById("user-" + o.title)
        }
        obj.style.top = (o.last_y + (mapSize / 2)) + "px";
        obj.style.left = (o.last_x + (mapSize / 2)) + "px";

        obj.style.transform = "translate(-50%, -50%) scale(" + (1 / currentScale) + ")";

        var online = new Date(o.last_online);
        var current = new Date();
        if (current - online < offlineInterval) {
            result.push("<span onClick='moveTo(" + -o.last_x + ", " + -o.last_y + ")'>" + o.title + "</span>");

            if (o.id == userID) {
                obj.classList.add("hidden");
            } else {
                obj.classList.remove("hidden");
            }
        } else {
            obj.classList.add("hidden");
        }
    });

    var joined = result.join(", ");

    if (joined != document.getElementById("data-online").innerHTML) {
        document.getElementById("data-online").innerHTML = joined;
    }

    // <div class="otherUser"></div>
}

function moveTo(x, y) {
    console.log("MoveTo", x, y)
    posX = x;
    posY = y;
    velocityX = 0;
    velocityY = 0;
}

function setStatus(value) {
    if (!(isEditing.content || isEditing.title)) {
        data.tasks[fullscreenTask].status = value;
        updateTaskApi(fullscreenTask, { "status": value }, 3, value);

        update();
    }
}

function buttonTask() {
    closeMenu();
    createTaskApi({
        title: "*** Nový úkol ***",
        location_x: - posX,
        location_y: - posY,
        status: 0,
        board_id: boardId,
    });
}

function removeTask() {
    var captcha = document.getElementById("data-captcha").value;

    if (captcha == "ANO") {
        delete data.tasks[fullscreenTask];
        updateTaskApi(fullscreenTask, { "removed": 1 }, 0);
        document.getElementById("data-captcha").value = "NE"
        closeDetail();
        update();
    } else {
        document.getElementById("data-captcha").value = "NE"
    }
}

function buttonLine() {
    closeMenu();
    if (lineCreationProgress == 0) {
        lineCreationProgress = 1;
        isEditing.connection = true;
        document.getElementById("buttonLine").classList.add("enabled");
    } else {
        lineCreationProgress = 0;
        isEditing.connection = false;
        document.getElementById("buttonLine").classList.remove("enabled");
    }
}

function finishLineCreation(taskId) {
    switch (lineCreationProgress) {
        case 1:
            editedTask = taskId;
            lineCreationProgress = 2;

            document.getElementById("task-" + taskId).classList.add("selected");
            break;

        case 2:
            if (editedTask != taskId) {
                createLineApi({
                    from_id: editedTask,
                    to_id: taskId,
                    board_id: boardId,
                });
            }
            lineCreationProgress = 0;
            isEditing.connection = false;
            document.getElementById("buttonLine").classList.remove("enabled");
            break;
    }
}

function deleteLine(lineId) {
    if (removingLine == lineId) {
        delete data.connections[lineId];
        update();
        deleteLineApi(lineId);
    } else {
        removingLine = lineId;
        setTimeout(() => {
            removingLine = null;
        }, 1000);
        
    }
}

function getMobileOperatingSystem() {
    var userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
    if (/windows phone/i.test(userAgent)) {
        return "Windows Phone";
    }

    if (/android/i.test(userAgent)) {
        return "Android";
    }

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        return "iOS";
    }

    return false;
}

function encodeStr(str) {
    return str.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
        return '&#'+i.charCodeAt(0)+';';
    });
}

window.onkeydown = (e) => {
    if (e.keyCode == 70 && e.ctrlKey) {
        openFilter()
        e.preventDefault();
    }
    if (e.keyCode == 27) {
        closeMenu();
        closeDetail();
    }
}

function openFilter() {
    if (menu == 1) {
        closeMenu();
    } else {
        document.getElementById("buttonFilter").classList.add("enabled");
        document.getElementById("buttonNotify").classList.remove("enabled");
        document.getElementById("menuOverlayContainer").className = "menu-filter";
        menu = 1;
        document.getElementById("fulltext-search").focus();
    }
}

function openNotify() {
    if (menu == 2) {
        closeMenu();
    } else {
        document.getElementById("buttonNotify").classList.add("enabled");
        document.getElementById("buttonFilter").classList.remove("enabled");
        document.getElementById("menuOverlayContainer").className = "menu-notify";
        menu = 2;
    }
}

function closeMenu() {
    document.getElementById("buttonNotify").classList.remove("enabled");
    document.getElementById("buttonFilter").classList.remove("enabled");
    document.getElementById("menuOverlayContainer").className = "hidden";
    menu = 0;
}

function getRelatedNotifications(relatable) {
    if (!allNotifications) {
        relatable = relatable.filter((n) => {
            const task = data.tasks[parseInt(n.task_id)];
            if (!task) return false;
            if (task.assignee.includes(parseInt(userID))) return true;
            return false;
        })
    }
    return relatable;
}

function updateNotifications() {
    var container = document.getElementById("data-notifications");
    var button = document.getElementById("buttonNotify");

    let relatable = getRelatedNotifications(Object.values(data.notify).reverse());

    var result = relatable.map((e) => {
        const onSameTask = relatable.filter((notification) => notification.task_id === e.task_id);

        var icon = "";
        var title = "";
        var subtitle = e.timestamp;
        var note = e.note;
        var noteNum = parseInt(e.note);

        var taskId = parseInt(e.task_id);
        var taskName = "<strong>" + ((data.tasks[taskId]) ? data.tasks[taskId].title : "který už neexistuje") + "</strong>";

        var author = "";

        if (onSameTask.length > 1) {
            // Multiple notifications for same task
            if (onSameTask[0] !== e) {
                // Only for the first
                return "";
            }

            if (onSameTask.every((curr) => curr.author_id === e.author_id)) {
                var authorId = parseInt(e.author_id);
                title = "<strong>" + ((data.assignees[authorId]) ? data.assignees[authorId].title : "Někdo, kdo nejede na tábor") + "</strong> provedl několik změn v úkolu " + taskName;
            } else {
                title = "<strong>Několik vedoucích</strong> provedlo vícero změn v úkolu " + taskName;
            }
            icon = "list";

        } else {
            var authorId = parseInt(e.author_id);
            author = "<strong>" + ((data.assignees[authorId]) ? data.assignees[authorId].title : "Někdo, kdo nejede na tábor") + "</strong>";

            switch (parseInt(e.type)) {
                case 1:
                    icon = "font";
                    var original = "<strong>" + note + "</strong>";
                    title = author + " změnil nadpis úkolu " + taskName + " na " + original;
                    break;
                
                case 2:
                    icon = "align-left";
                    title = author + " změnil obsah úkolu " + taskName;
                    break;
                case 3:
                    icon = "cog";
                    var type = "";
                    switch (noteNum) {
                        case 0: type = "Kdopak si mě vezme?"; break;
                        case 1: type = "Kde nic, tu nic"; break;
                        case 2: type = "Makám na tom!"; break;
                        case 3: type = "Mám to hotové!"; break;
                        case 3: type = "Až na táboře..."; break;
                    }
                    type = "<strong>" + type + "</strong>";
                    title = author + " změnil stav úkolu " + taskName + " na " + type;
                    break;
                case 4:
                    icon = "users";
                    var type = data.assignees[noteNum] ? ("<strong>" + data.assignees[noteNum].title + "</strong>") : "<strong>který už není v systému</strong>";
                    title = author + " přidal k úkolu " + taskName + " umpalumpu " + type;
                    break;
                case 5:
                    icon = "users";
                    var type = data.assignees[noteNum] ? ("<strong>" + data.assignees[noteNum].title + "</strong>") : "<strong>který už není v systému</strong>";
                    title = author + " odebral z úkolu " + taskName + " umpalumpu " + type;
                    break;
                case 6:
                    icon = "tags";
                    var type = data.tags[noteNum] ? ("<strong>" + data.tags[noteNum].title + "</strong>") : "<strong>který už neexistuje</strong>";
                    title = author + " přidal k úkolu " + taskName + " štítek " + type;
                    break;
                case 7:
                    icon = "tags";
                    var type = data.tags[noteNum] ? ("<strong>" + data.tags[noteNum].title + "</strong>") : "<strong>který už neexistuje</strong>";
                    title = author + " odebral z úkolu " + taskName + " štítek " + type;
                    break;
                default:
                    icon = "exclamation-triangle";
                    title = author + " je hacker a pohrával si s úkolem " + taskName;
            }
        }        

        var href = (data.tasks[taskId]) ? "#" + taskId : "javascript:notifyClear(" + taskId + ");";

        return `<a class="notification" href="` + href + `">
                 <div class="notificationIcon fa fa-` + icon + `"></div>
                 <div class="notificationTitle">` + title + `</div>
                 <div class="notificationSubtitle">` + subtitle + `</div>
                </a>`;
    }).join("");

    const toggle = `<span style="margin-right:20px;" class="notifyClearAll"><input id="allNotifications" type="checkbox" style="width: 13px; height: 13px; margin-right: 5px;" onChange="toggleAllNotifications();" ${!allNotifications ? "checked" : ""}/><label for="allNotifications">Zobrazovat pouze upozornění, která se mě týkají</label></span><a href="javascript:notifyClearAll();update();" class="notifyClearAll">Označit vše, jako přečtené</a>`;

    if (!result || result == "") {
        container.innerHTML = "<div>"+toggle+"</div><div class='noInfo'>Žádná upozornění...</div>";
        button.classList.remove("dot");
    } else {
        container.innerHTML = '<div>'+toggle+'</div>' + result;
        button.classList.add("dot");
    }

    var notificationsCount = Object.keys(getRelatedNotifications(Object.values(data.notify).reverse())).length;
    if (notificationsCount > 0) {
        document.title = "(" + notificationsCount + ") " + boardName + " - " + title;
    } else {
        document.title = boardName + " - " + title;
    }
}

function toggleAllNotifications() {
    allNotifications = !allNotifications;
    const localStorage = window.localStorage;
    if (localStorage) {
        localStorage.setItem('ukologram.allNotifications', allNotifications ? "true" : "false");
    }
    update();
}

function updateFilters() {
    var container = document.getElementById("menu-filter");

    var result = `<div style="font-size: 0.8em; display: flex; flex-direction: row;"><span style="margin-right: 5px;height: 100%;display: block;line-height: 20px;">Hledat: </span>
    <input id="fulltext-search" type="text" style="border: solid 1px #BBB; border-radius: 2px; width: 100%; font-size: 1em;" onchange="setFulltextFilter(this);" onkeyup="this.onchange();" onpaste="this.onchange();" oninput="this.onchange();">
    </div>`;

    foundItems = Object.entries(data.tasks).filter(([key, task]) => shouldDisplay(key)).map(([key, task]) => task).sort((a, b) => a.location.x - b.location.x);

    if (foundItems.length < Object.keys(data.tasks).length) {
        if (foundItems.length > 0) {
            posX = mapSize/2 - foundItems[foundItems.length - 1].location.x;
            posY = mapSize/2 - foundItems[foundItems.length - 1].location.y;
            currentScale = 1;
        }
        result += `<div style="font-size: 0.8em; margin-top:5px">Nalezeno ${foundItems.length} - <span style="color: mediumblue; cursor: pointer" onclick="loopSearch()">Další (enter)</span></div>`;
    }

    result += "<hr/>";

    result += Object.values(data.assignees).map((e) => {
        var isInFilter = filter.assignees.includes(parseInt(e.id));

        return `<div onClick="setFilter(` + e.id + `, true)" class="assignee ` + (isInFilter ? "removable" : "add") + `">` + e.title + `</div>`;
    }).join("");

    result += "<hr/>";

    result += Object.values(data.tags).map((e) => {
        var isInFilter = filter.tags.includes(parseInt(e.id));

        return `<div onClick="setFilter(` + e.id + `, false)" style="background: ` + e.color + `; color: ` + lightOrDark(e.color) + `" class="tag ` + (isInFilter ? "removable" : "add") + `">` + e.title + `</div>`;
    }).join("");

    result += "<hr/>";

    result += '<div onClick="clearFilter()" class="assignee removable">Vymazat všechny filtry</div>';

    container.innerHTML = result;

    let newbj = document.getElementById("fulltext-search");
    newbj.value = filter.fulltext;
    newbj.focus();
    newbj.addEventListener('keydown', (e) => {
        if (e.keyCode == 13) {
            loopSearch();
            e.preventDefault();
        }
    });
}

function setFilter(id, assignee) {
    var isInFilter = (assignee?(filter.assignees):(filter.tags)).includes(id);

    if (isInFilter) {
        if (assignee) {
            filter.assignees = remove(filter.assignees, id);
        } else {
            filter.tags = remove(filter.tags, id);
        }
    } else {
        if (assignee) {
            filter.assignees.push(id);
        } else {
            filter.tags.push(id);
        }
    }

    update();
}

function setFulltextFilter(obj) {
    if (obj.value == filter.fulltext) return;
    filter.fulltext = obj.value;
    update();
    let newbj = document.getElementById("fulltext-search");
    newbj.value = filter.fulltext;
    newbj.focus();
}

function loopSearch() {
    if (foundItems.length === 0) return;
    const goto = foundItems[0];
    foundItems = foundItems.filter((_, i) => i > 0);
    foundItems.push(goto);
    posX = mapSize/2 - goto.location.x;
    posY = mapSize/2 - goto.location.y;
    currentScale = 1;
}

function clearFilter() {
    filter = {
        assignees: [],
        tags: [],
        fulltext: ""
    }
    update();
}

function shouldDisplay(taskId) {
    if (filter.assignees.length > 0 && intersect(filter.assignees, data.tasks[taskId].assignee).length == 0) {
        return false;
    }
    if (filter.tags.length > 0 && intersect(filter.tags, data.tasks[taskId].tags).length == 0) {
        return false;
    }
    if (filter.fulltext.length > 0 && !data.tasks[taskId].title.toLowerCase().includes(filter.fulltext.toLowerCase())) {
        return false;
    }
    return true;
}

function toggleView() {
    listView = !listView;

    setMode();
}

function toggleAllColumns() {
    allColumns = !allColumns;
    const localStorage = window.localStorage;
    if (localStorage) {
        localStorage.setItem('ukologram.allColumns', allColumns ? "true" : "false");
    }
    updateList();
}

function setMode() {
    if (listView) {
        document.getElementById("buttonToggleView").className = "button fa fa-sitemap";
        document.getElementById("buttonToggleView").title = "Zobrazit mapu";
        document.body.classList.add("list");
        document.body.classList.remove("diagram");
    } else {
        document.getElementById("buttonToggleView").className = "button fa fa-list";
        document.getElementById("buttonToggleView").title = "Zobrazit seznam";
        document.body.classList.remove("list");
        document.body.classList.add("diagram");
    }
    const localStorage = window.localStorage;
    if (localStorage) {
        localStorage.setItem('ukologram.listView', listView ? "true" : "false");
    }
}

function updateList() {
    const container = document.getElementById("listContainer");
    container.innerHTML = "";

    createGroup(
        "Moje úkoly",
        container, 
        Object.keys(data.tasks).filter((id) => data.tasks[id].assignee.includes(parseInt(userID))).sort((a, b) => data.tasks[a].title.localeCompare(data.tasks[b].title)).sort((a, b) => data.tasks[a].status - data.tasks[b].status)
    );

    createGroup(
        "Kdopak si mě vezme?",
        container, 
        Object.keys(data.tasks).filter((id) => data.tasks[id].status === 0).sort((a, b) => data.tasks[a].title.localeCompare(data.tasks[b].title))
    );

    if (allColumns) {
        createGroup(
            "Všechny úkoly",
            container, 
            Object.keys(data.tasks).sort((a, b) => data.tasks[a].title.localeCompare(data.tasks[b].title))
        );
    }
}

function createGroup(text, container, content) {
    const group = document.createElement("div");
    group.className="list-group";

    const title = document.createElement("h1");
    title.innerText = text;
    group.appendChild(title);

    const scroll = document.createElement("div");
    scroll.className="list-group-scroll";
    group.appendChild(scroll);
    content.forEach((o) => appendAndUpdate(o, scroll));

    container.appendChild(group);
}

function appendAndUpdate(id, container) {
    const object = generateTask(id, "task listtask", "", false)
    container.appendChild(object);
    setTaskData(id, object, "task listtask");
}