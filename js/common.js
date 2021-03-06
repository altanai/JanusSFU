/**
 * Created by IntelliJ IDEA.
 * User: Altanai ( @altanai)
 * Date: 2020
 * Time: 12:54 PM
 */


// Timezone
function getUserDateTime(Usertimezone) {
    let month = [];
    month[1] = "Jan";
    month[2] = "Feb";
    month[3] = "Mar";
    month[4] = "Apr";
    month[5] = "May";
    month[6] = "June";
    month[7] = "July";
    month[8] = "Aug";
    month[9] = "Sept";
    month[10] = "Oct";
    month[11] = "Nov";
    month[12] = "Dec";
    let wday = [];
    wday[0] = "Sun";
    wday[1] = "Mon";
    wday[2] = "Tue";
    wday[3] = "Wed";
    wday[4] = "Thur";
    wday[5] = "Fri";
    wday[6] = "Sat";


    let userTime = new Date().toLocaleString("en-US", {timeZone: Usertimezone});
    let d = new Date(userTime);
    let userDate = userTime.toLocaleString();
    let splData = userDate.split(",");
    let usDays = splData[0].split("/");
    let usrday = wday[d.getDay()];
    let usrMonth = month[usDays[0]];
    let usrYear = d.getUTCFullYear();
    let usrDate = usDays[1];
    return usrday + ", " + usrDate + " " + usrMonth + " " + usrYear;

}

// get url param
function gup(name, url) {
    if (name) {
        if (!url) url = location.href;
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS = "[\\?&]" + name + "=([^&#]*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(url);
        return results == null ? null : results[1];
    } else {

    }
}

$(function () {

    // File share
    $("#fileshareBtn").click(function () {
        openfilebox();
    });

    $("#fileShare-list").click(function () {
        openfilebox();
    });

    $("#inputFile1").change(function () {
        readURL(this);
    });

    $(".plus-minus-toggle").click(function () {
        $(".plus-minus-toggle").toggleClass("active");
    });

    $(".plus-minus-chat-toggle").click(function () {
        $(".plus-minus-chat-toggle").toggleClass("active");
    });

    // $('.panel-group').on('hidden.bs.collapse');
    // $('.panel-group').on('shown.bs.collapse');

    // Open the Draw Tab
    $("#draw-webrtc").click(function () {
        opendrawbox();
    });

    // Open the Draw Tab
    $("#draw-list").click(function () {
        opendrawbox();
    });

    // Open screen share
    $("#screenShare-list").click(function () {
        openscreensharebox();
    });

});

function onLocalConnectHandler() {

    let role = gup("role", window.location.url);
    let userstatus = 0;
    if (role == "guest")
        return;
    else if (role == "participant")
        userstatus = 1;
    else if (role == "host")
        userstatus = 3;

    let useremail = webrtcdevobj.getwebcallpeers()[0].email;
    var datastring = {
        webrtcuseremail: useremail,
        apikey: apikey_session,
        webrtcconnectiontype: userstatus,
        webrtcsessionid: webrtcdevobj.sessionid
    };
    sendUserSession(datastring)
        .then(data => console.log(JSON.stringify(data)))
        .catch(error => console.error(error));
}

function minmaxChatBox(event) {
    var elems = document.getElementById("chatContainer");
    var ishidden = elems.getAttribute("style").includes("display:none") || elems.getAttribute("hidden") != null;
    var elem = event.srcElement;

    if (ishidden) {
        elem.innerHTML = "-";
        //elems[x].setAttribute("style","display:table-cell");
    } else {
        elem.innerHTML = "+";
        //elems[x].setAttribute("style","display:none")
    }
}

function openwidgesbox() {
    var widget_maindiv = document.getElementById("widget_centralarea");
    if (widget_maindiv.style.display == "none") {
        // widget_maindiv.style.display == "block";
        widget_maindiv.setAttribute("style", "display:block");
    }
}

function opendrawbox() {
    $("#draw-list").addClass("active");
    $("#draw").removeClass("hidden");
    $("#draw").addClass("active");
    closefilebox();
    closescreensharebox();
}

function closedrawbox() {
    $("#draw-list").removeClass("active");
    $("#draw").removeClass("active");
    $("#draw").addClass("hidden");
}

function openscreensharebox() {
    $("#screenShare-list").addClass("active");
    $("#screenShare").removeClass("hidden");
    $("#screenShare").addClass("active");
    closedrawbox();
    closefilebox();
}

function closescreensharebox() {
    $("#screenShare-list").removeClass("active");
    $("#screenShare").removeClass("active");
    $("#screenShare").addClass("hidden");
}

function openfilebox() {
    $("#fileShare-list").addClass("active");
    $("#fileShare").removeClass("hidden");
    $("#fileShare").addClass("active");
    closedrawbox();
    closescreensharebox();
}

function closefilebox() {
    $("#fileShare-list").removeClass("active");
    $("#fileShare").removeClass("active");
    $("#fileShare").addClass("hidden");
}

function openchat() {
    if (!document.getElementById("chat-box").style.display || document.getElementById("chat-box").style.display == "none")
        document.getElementById("chat-circle").click();
}

// before unload update status on main site
window.addEventListener("beforeunload", function (e) {
    e.preventDefault();
    if (webrtcdevobj.getwebcallpeers().length < 1)
        return;
    if (webrtcdevobj.connectionStatus == "closed")
        return;
    // delete e['returnValue'];
    // e.returnValue = '';
});
