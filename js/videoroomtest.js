var server = "wss://localhost:8989/ws";

var janus = null;
var sfutest = null;
var opaqueId = "videoroomtest-" + Janus.randomString(12);

var myroom = 1234;
var myusername = "yyyy";
var myid = null;
var mystream = null;
var mypvtid = null;

var feeds = [];
var bitrateTimer = [];

var doSimulcast = true;
var doSimulcast2 = false;


var npublishers = 20;

$(document).ready(function () {

    Janus.init({
        debug: "all",

        callback: function () {

            if (!Janus.isWebrtcSupported()) {
                alert("No WebRTC support... ");
                return;
            }

            // Create session
            janus = new Janus(
                {
                    server: server,
                    success: function () {

                        // Attach to VideoRoom plugin
                        janus.attach(
                            {
                                plugin: "janus.plugin.videoroom",
                                opaqueId: opaqueId,
                                success: function (pluginHandle) {
                                    $('#details').remove();
                                    sfutest = pluginHandle;
                                    Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                                    Janus.log("  -- This is a publisher/manager");

                                    // Prepare the username registration
                                    var register = {
                                        request: "join",
                                        room: myroom,
                                        ptype: "publisher",
                                        display: myusername
                                    };
                                    myusername = myusername;
                                    sfutest.send({message: register});
                                },
                                error: function (error) {
                                    Janus.error("  -- Error attaching plugin...", error);
                                    alert("Error attaching plugin... " + error);
                                },
                                consentDialog: function (on) {
                                    Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
                                },
                                iceState: function (state) {
                                    Janus.log("ICE state changed to " + state);
                                },
                                mediaState: function (medium, on) {
                                    Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                                },
                                webrtcState: function (on) {
                                    Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                                    if (!on)
                                        return;
                                    $('#publish').remove();
                                    // This controls allows us to override the global room bitrate cap
                                    $('#bitrate').parent().parent().removeClass('hide').show();
                                    $('#bitrate a').click(function () {
                                        var id = $(this).attr("id");
                                        var bitrate = parseInt(id) * 1000;
                                        if (bitrate === 0) {
                                            Janus.log("Not limiting bandwidth via REMB");
                                        } else {
                                            Janus.log("Capping bandwidth to " + bitrate + " via REMB");
                                        }
                                        $('#bitrateset').html($(this).html() + '<span class="caret"></span>').parent().removeClass('open');
                                        sfutest.send({message: {request: "configure", bitrate: bitrate}});
                                        return false;
                                    });
                                },
                                onmessage: function (msg, jsep) {
                                    Janus.debug(" ::: Got a message (publisher) :::", msg);
                                    var event = msg["videoroom"];
                                    Janus.debug("Event: " + event);
                                    if (event) {
                                        if (event === "joined") {
                                            // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                            myid = msg["id"];
                                            mypvtid = msg["private_id"];
                                            Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                            publishOwnFeed(true);
                                            // Any new feed to attach to?
                                            if (msg["publishers"]) {
                                                var list = msg["publishers"];
                                                Janus.debug("Got a list of available publishers/feeds:", list);
                                                for (var f in list) {
                                                    var id = list[f]["id"];
                                                    var display = list[f]["display"];
                                                    var audio = list[f]["audio_codec"];
                                                    var video = list[f]["video_codec"];
                                                    Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                    newRemoteFeed(id, display, audio, video);
                                                }
                                            }
                                        } else if (event === "destroyed") {
                                            // The room has been destroyed
                                            Janus.warn("The room has been destroyed!");
                                            bootbox.alert("The room has been destroyed", function () {
                                                window.location.reload();
                                            });
                                        } else if (event === "event") {
                                            // Any new feed to attach to?
                                            if (msg["publishers"]) {
                                                var list = msg["publishers"];
                                                Janus.debug("Got a list of available publishers/feeds:", list);
                                                for (var f in list) {
                                                    var id = list[f]["id"];
                                                    var display = list[f]["display"];
                                                    var audio = list[f]["audio_codec"];
                                                    var video = list[f]["video_codec"];
                                                    Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                    newRemoteFeed(id, display, audio, video);
                                                }
                                            } else if (msg["leaving"]) {
                                                // One of the publishers has gone away?
                                                var leaving = msg["leaving"];
                                                Janus.log("Publisher left: " + leaving);
                                                var remoteFeed = null;
                                                for (var i = 1; i < npublishers; i++) {
                                                    if (feeds[i] && feeds[i].rfid == leaving) {
                                                        remoteFeed = feeds[i];
                                                        break;
                                                    }
                                                }
                                                if (remoteFeed != null) {
                                                    Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                    $('#remote' + remoteFeed.rfindex).empty().hide();
                                                    $('#videoremote' + remoteFeed.rfindex).empty();
                                                    feeds[remoteFeed.rfindex] = null;
                                                    remoteFeed.detach();
                                                }
                                            } else if (msg["unpublished"]) {
                                                // One of the publishers has unpublished?
                                                var unpublished = msg["unpublished"];
                                                Janus.log("Publisher left: " + unpublished);
                                                if (unpublished === 'ok') {
                                                    // That's us
                                                    sfutest.hangup();
                                                    return;
                                                }
                                                var remoteFeed = null;
                                                for (var i = 1; i < npublishers; i++) {
                                                    if (feeds[i] && feeds[i].rfid == unpublished) {
                                                        remoteFeed = feeds[i];
                                                        break;
                                                    }
                                                }
                                                if (remoteFeed != null) {
                                                    Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                    $('#remote' + remoteFeed.rfindex).empty().hide();
                                                    $('#videoremote' + remoteFeed.rfindex).empty();
                                                    feeds[remoteFeed.rfindex] = null;
                                                    remoteFeed.detach();
                                                }
                                            } else if (msg["error"]) {
                                                if (msg["error_code"] === 426) {
                                                    // This is a "no such room" error: give a more meaningful description
                                                    alert(
                                                        "<p>Apparently room <code>" + myroom + "</code> (the one this demo uses as a test room) " +
                                                        "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.jcfg</code> " +
                                                        "configuration file? If not, make sure you copy the details of room <code>" + myroom + "</code> " +
                                                        "from that sample in your current configuration file, then restart Janus and try again."
                                                    );
                                                } else {
                                                    alert(msg["error"]);
                                                }
                                            }
                                        }
                                    }
                                    if (jsep) {
                                        Janus.debug("Handling SDP as well...", jsep);
                                        sfutest.handleRemoteJsep({jsep: jsep});
                                        // Check if any of the media we wanted to publish has
                                        // been rejected (e.g., wrong or unsupported codec)
                                        var audio = msg["audio_codec"];
                                        if (mystream && mystream.getAudioTracks() && mystream.getAudioTracks().length > 0 && !audio) {
                                            // Audio has been rejected
                                            console.warning("Our audio stream has been rejected, viewers won't hear us");
                                        }
                                        var video = msg["video_codec"];
                                        if (mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
                                            // Video has been rejected
                                            console.warning("Our video stream has been rejected, viewers won't see us");
                                            // Hide the webcam video
                                            $('#myvideo').hide();
                                            $('#videolocal').append(
                                                '<div class="no-video-container">' +
                                                '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
                                                '<span class="no-video-text" style="font-size: 16px;">Video rejected, no webcam</span>' +
                                                '</div>');
                                        }
                                    }
                                },
                                onlocalstream: function (stream) {
                                    Janus.debug(" ::: Got a local stream :::", stream);
                                    mystream = stream;
                                    $('#videojoin').hide();
                                    $('#videos').removeClass('hide').show();
                                    if ($('#myvideo').length === 0) {
                                        $('#videolocal').append('<video class="rounded centered" id="myvideo" width="100%" height="100%" autoplay playsinline muted="muted"/>');
                                        // Add a 'mute' button
                                        $('#videolocal').append('<button class="btn btn-warning btn-xs" id="mute" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;">Mute</button>');
                                        $('#mute').click(toggleMute);
                                        // Add an 'unpublish' button
                                        $('#videolocal').append('<button class="btn btn-warning btn-xs" id="unpublish" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;">Unpublish</button>');
                                        $('#unpublish').click(unpublishOwnFeed);
                                    }
                                    // $('#publisher').removeClass('hide').html(myusername).show();
                                    Janus.attachMediaStream($('#myvideo').get(0), stream);
                                    $("#myvideo").get(0).muted = "muted";
                                    if (sfutest.webrtcStuff.pc.iceConnectionState !== "completed" &&
                                        sfutest.webrtcStuff.pc.iceConnectionState !== "connected") {
                                        console.log(" Local stream comnnected ");
                                    }
                                    var videoTracks = stream.getVideoTracks();
                                    if (!videoTracks || videoTracks.length === 0) {
                                        // No webcam
                                        $('#myvideo').hide();
                                        if ($('#videolocal .no-video-container').length === 0) {
                                            $('#videolocal').append(
                                                '<div class="no-video-container">' +
                                                '<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
                                                '<span class="no-video-text">No webcam available</span>' +
                                                '</div>');
                                        }
                                    } else {
                                        $('#videolocal .no-video-container').remove();
                                        $('#myvideo').removeClass('hide').show();
                                    }
                                },
                                onremotestream: function (stream) {
                                    // The publisher stream is sendonly, we don't expect anything here
                                },
                                oncleanup: function () {
                                    Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                    mystream = null;
                                    $('#videolocal').html('<button id="publish" class="btn btn-primary">Publish</button>');
                                    $('#publish').click(function () {
                                        publishOwnFeed(true);
                                    });
                                    $("#videolocal").parent().parent().unblock();
                                    $('#bitrate').parent().parent().addClass('hide');
                                    $('#bitrate a').unbind('click');
                                }
                            });
                    },
                    error: function (error) {
                        Janus.error(error);
                    },
                    destroyed: function () {
                        //window.location.reload();
                        console.error("session destroyed");
                    }
                });

        }
    });
});

function checkEnter(field, event) {
    var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
    if (theCode == 13) {
        registerUsername();
        return false;
    } else {
        return true;
    }
}

function registerUsername() {
    if ($('#username').length === 0) {
        // Create fields to register
        $('#register').click(registerUsername);
        $('#username').focus();
    } else {
        // Try a registration
        $('#username').attr('disabled', true);
        $('#register').attr('disabled', true).unbind('click');
        var username = $('#username').val();
        if (username === "") {
            $('#you')
                .removeClass().addClass('label label-warning')
                .html("Insert your display name (e.g., pippo)");
            $('#username').removeAttr('disabled');
            $('#register').removeAttr('disabled').click(registerUsername);
            return;
        }
        if (/[^a-zA-Z0-9]/.test(username)) {
            $('#you')
                .removeClass().addClass('label label-warning')
                .html('Input is not alphanumeric');
            $('#username').removeAttr('disabled').val("");
            $('#register').removeAttr('disabled').click(registerUsername);
            return;
        }
        var register = {
            request: "join",
            room: myroom,
            ptype: "publisher",
            display: username
        };
        myusername = username;
        sfutest.send({message: register});
    }
}

function publishOwnFeed(useAudio) {

    console.log(" ----------------------- publish own feed ");
    console.log(" simulcast ", doSimulcast);
    console.log(" simulcast2 ", doSimulcast2);

    // Publish our stream
    $('#publish').attr('disabled', true).unbind('click');
    sfutest.createOffer(
        {
            // Add data:true here if you want to publish datachannels as well
            media: {audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true},	// Publishers are sendonly
            simulcast: doSimulcast,
            simulcast2: doSimulcast2,
            success: function (jsep) {
                Janus.debug("Got publisher SDP!", jsep);
                var publish = {request: "configure", audio: useAudio, video: true};
                // publish["audiocodec"] = "opus";
                // publish["videocodec"] = "vp9";

                // refer to the text in janus.plugin.videoroom.jcfg
                sfutest.send({message: publish, jsep: jsep});
            },
            error: function (error) {
                Janus.error("WebRTC error:", error);
                if (useAudio) {
                    publishOwnFeed(false);
                } else {
                    alert("WebRTC error... " + error.message);
                    $('#publish').removeAttr('disabled').click(function () {
                        publishOwnFeed(true);
                    });
                }
            }
        });
}

function toggleMute() {
    var muted = sfutest.isAudioMuted();
    Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
    if (muted)
        sfutest.unmuteAudio();
    else
        sfutest.muteAudio();
    muted = sfutest.isAudioMuted();
    $('#mute').html(muted ? "Unmute" : "Mute");
}


function unpublishOwnFeed() {
    $('#unpublish').attr('disabled', true).unbind('click');
    var unpublish = {request: "unpublish"};
    sfutest.send({message: unpublish});
}

function newRemoteFeed(id, display, audio, video) {
    // A new feed has been published, create a new plugin handle and attach to it as a subscriber
    var remoteFeed = null;
    janus.attach(
        {
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId,
            success: function (pluginHandle) {
                remoteFeed = pluginHandle;
                remoteFeed.simulcastStarted = false;
                Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                Janus.log("  -- This is a subscriber");

                // We wait for the plugin to send us an offer
                var subscribe = {
                    request: "join",
                    room: myroom,
                    ptype: "subscriber",
                    feed: id,
                    private_id: mypvtid
                };
                // In case you don't want to receive audio, video or data, even if the publisher is sending them,
                // set the 'offer_audio', 'offer_video' or 'offer_data' properties to false (they're true by default), e.g.:
                // subscribe["offer_video"] = false;
                // For example, if the publisher is VP8 and this is Safari, let's avoid video
                if (Janus.webRTCAdapter.browserDetails.browser === "safari" &&
                    (video === "vp9" || (video === "vp8" && !Janus.safariVp8))) {
                    if (video)
                        video = video.toUpperCase()
                    console.error("Publisher is using " + video + ", but Safari doesn't support it: disabling video");
                    subscribe["offer_video"] = false;

                }
                remoteFeed.videoCodec = video;
                remoteFeed.send({message: subscribe});
            },
            error: function (error) {
                Janus.error("  -- Error attaching plugin...", error);
                alert("Error attaching plugin... " + error);
            },
            onmessage: function (msg, jsep) {
                Janus.debug(" ::: Got a message (subscriber) :::", msg);
                var event = msg["videoroom"];
                Janus.debug("Event: " + event);
                if (msg["error"]) {
                    alert(msg["error"]);
                } else if (event) {
                    if (event === "attached") {
                        // Subscriber created and attached
                        for (var i = 1; i < npublishers; i++) {
                            if (!feeds[i]) {
                                feeds[i] = remoteFeed;
                                remoteFeed.rfindex = i;
                                break;
                            }
                        }
                        remoteFeed.rfid = msg["id"];
                        remoteFeed.rfdisplay = msg["display"];
                        Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
                        $('#remote' + remoteFeed.rfindex).removeClass('hide').html(remoteFeed.rfdisplay).show();
                    } else if (event === "event") {
                        // Check if we got an event on a simulcast-related event from this publisher
                        var substream = msg["substream"];
                        var temporal = msg["temporal"];
                        if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                            if (!remoteFeed.simulcastStarted) {
                                remoteFeed.simulcastStarted = true;
                                // Add some new buttons
                                addSimulcastButtons(remoteFeed.rfindex, remoteFeed.videoCodec === "vp8" || remoteFeed.videoCodec === "h264");
                            }
                            // We just received notice that there's been a switch, update the buttons
                            updateSimulcastButtons(remoteFeed.rfindex, substream, temporal);
                        }
                    } else {
                        // What has just happened?
                    }
                }
                if (jsep) {
                    Janus.debug("Handling SDP as well...", jsep);
                    // Answer and attach
                    remoteFeed.createAnswer(
                        {
                            jsep: jsep,
                            // Add data:true here if you want to subscribe to datachannels as well
                            // (obviously only works if the publisher offered them in the first place)
                            media: {audioSend: false, videoSend: false},	// We want recvonly audio/video
                            success: function (jsep) {
                                Janus.debug("Got SDP!", jsep);
                                var body = {request: "start", room: myroom};
                                remoteFeed.send({message: body, jsep: jsep});
                            },
                            error: function (error) {
                                Janus.error("WebRTC error:", error);
                                bootbox.alert("WebRTC error... " + error.message);
                            }
                        });
                }
            },
            iceState: function (state) {
                Janus.log("ICE state of this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") changed to " + state);
            },
            webrtcState: function (on) {
                Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
            },
            onlocalstream: function (stream) {
                // The subscriber stream is recvonly, we don't expect anything here
            },
            onremotestream: function (stream) {
                Janus.debug("Remote feed #" + remoteFeed.rfindex + ", stream:", stream);
                var addButtons = false;

                if ($('#remotevideo' + remoteFeed.rfindex).length === 0) {
                    addButtons = true;
                    // No remote video yet
                    $('#videoremote' + remoteFeed.rfindex).append('<video class="rounded centered" id="waitingvideo' + remoteFeed.rfindex + '" width=320 height=240 />');
                    $('#videoremote' + remoteFeed.rfindex).append('<video class="rounded centered relative hide" id="remotevideo' + remoteFeed.rfindex + '" width="100%" height="100%" autoplay playsinline/>');
                    $('#videoremote' + remoteFeed.rfindex).append(
                        '<span class="label label-primary hide" id="curres' + remoteFeed.rfindex + '" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;"></span>' +
                        '<span class="label label-info hide" id="curbitrate' + remoteFeed.rfindex + '" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;"></span>');
                    // Show the video, hide the spinner and show the resolution when we get a playing event
                    $("#remotevideo" + remoteFeed.rfindex).bind("playing", function () {
                        if (remoteFeed.spinner)
                            remoteFeed.spinner.stop();
                        remoteFeed.spinner = null;
                        $('#waitingvideo' + remoteFeed.rfindex).remove();
                        if (this.videoWidth)
                            $('#remotevideo' + remoteFeed.rfindex).removeClass('hide').show();
                        var width = this.videoWidth;
                        var height = this.videoHeight;
                        $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                        if (Janus.webRTCAdapter.browserDetails.browser === "firefox") {
                            // Firefox Stable has a bug: width and height are not immediately available after a playing
                            setTimeout(function () {
                                var width = $("#remotevideo" + remoteFeed.rfindex).get(0).videoWidth;
                                var height = $("#remotevideo" + remoteFeed.rfindex).get(0).videoHeight;
                                $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                            }, 2000);
                        }
                    });
                }
                Janus.attachMediaStream($('#remotevideo' + remoteFeed.rfindex).get(0), stream);
                var videoTracks = stream.getVideoTracks();
                if (!videoTracks || videoTracks.length === 0) {
                    // No remote video
                    $('#remotevideo' + remoteFeed.rfindex).hide();
                    if ($('#videoremote' + remoteFeed.rfindex + ' .no-video-container').length === 0) {
                        $('#videoremote' + remoteFeed.rfindex).append(
                            '<div class="no-video-container">' +
                            '<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
                            '<span class="no-video-text">No remote video available</span>' +
                            '</div>');
                    }
                } else {
                    $('#videoremote' + remoteFeed.rfindex + ' .no-video-container').remove();
                    $('#remotevideo' + remoteFeed.rfindex).removeClass('hide').show();
                }
                if (!addButtons)
                    return;
                if (Janus.webRTCAdapter.browserDetails.browser === "chrome" || Janus.webRTCAdapter.browserDetails.browser === "firefox" ||
                    Janus.webRTCAdapter.browserDetails.browser === "safari") {
                    $('#curbitrate' + remoteFeed.rfindex).removeClass('hide').show();
                    bitrateTimer[remoteFeed.rfindex] = setInterval(function () {
                        // Display updated bitrate, if supported
                        var bitrate = remoteFeed.getBitrate();
                        $('#curbitrate' + remoteFeed.rfindex).text(bitrate);
                        // Check if the resolution changed too
                        var width = $("#remotevideo" + remoteFeed.rfindex).get(0).videoWidth;
                        var height = $("#remotevideo" + remoteFeed.rfindex).get(0).videoHeight;
                        if (width > 0 && height > 0)
                            $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                    }, 1000);
                }
            },
            oncleanup: function () {
                Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                if (remoteFeed.spinner)
                    remoteFeed.spinner.stop();
                remoteFeed.spinner = null;
                $('#remotevideo' + remoteFeed.rfindex).remove();
                $('#waitingvideo' + remoteFeed.rfindex).remove();
                $('#novideo' + remoteFeed.rfindex).remove();
                $('#curbitrate' + remoteFeed.rfindex).remove();
                $('#curres' + remoteFeed.rfindex).remove();
                if (bitrateTimer[remoteFeed.rfindex])
                    clearInterval(bitrateTimer[remoteFeed.rfindex]);
                bitrateTimer[remoteFeed.rfindex] = null;
                remoteFeed.simulcastStarted = false;
                $('#simulcast' + remoteFeed.rfindex).remove();
            }
        });
}

// Helper to parse query string
function getQueryStringValue(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Helpers to create Simulcast-related UI, if enabled
function addSimulcastButtons(feed, temporal) {
    var index = feed;
    $('#remote' + index).parent().append(
        '<div id="simulcast' + index + '" class="btn-group-vertical btn-group-vertical-xs pull-right">' +
        '	<div class"row">' +
        '		<div class="btn-group btn-group-xs" style="width: 100%">' +
        '			<button id="sl' + index + '-2" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to higher quality" style="width: 33%">SL 2</button>' +
        '			<button id="sl' + index + '-1" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to normal quality" style="width: 33%">SL 1</button>' +
        '			<button id="sl' + index + '-0" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to lower quality" style="width: 34%">SL 0</button>' +
        '		</div>' +
        '	</div>' +
        '	<div class"row">' +
        '		<div class="btn-group btn-group-xs hide" style="width: 100%">' +
        '			<button id="tl' + index + '-2" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 2" style="width: 34%">TL 2</button>' +
        '			<button id="tl' + index + '-1" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 1" style="width: 33%">TL 1</button>' +
        '			<button id="tl' + index + '-0" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 0" style="width: 33%">TL 0</button>' +
        '		</div>' +
        '	</div>' +
        '</div>'
    );
    // Enable the simulcast selection buttons
    $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Switching simulcast substream, wait for it... (lower quality)", null, {timeOut: 2000});
        if (!$('#sl' + index + '-2').hasClass('btn-success'))
            $('#sl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
        if (!$('#sl' + index + '-1').hasClass('btn-success'))
            $('#sl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
        $('#sl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
        feeds[index].send({message: {request: "configure", substream: 0}});
    });
    $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Switching simulcast substream, wait for it... (normal quality)", null, {timeOut: 2000});
        if (!$('#sl' + index + '-2').hasClass('btn-success'))
            $('#sl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
        $('#sl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
        if (!$('#sl' + index + '-0').hasClass('btn-success'))
            $('#sl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
        feeds[index].send({message: {request: "configure", substream: 1}});
    });

    $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Switching simulcast substream, wait for it... (higher quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
        if (!$('#sl' + index + '-1').hasClass('btn-success'))
            $('#sl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
        if (!$('#sl' + index + '-0').hasClass('btn-success'))
            $('#sl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
        feeds[index].send({message: {request: "configure", substream: 2}});
    });

    if (!temporal)	// No temporal layer support
        return;
    $('#tl' + index + '-0').parent().removeClass('hide');
    $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Capping simulcast temporal layer, wait for it... (lowest FPS)", null, {timeOut: 2000});
        if (!$('#tl' + index + '-2').hasClass('btn-success'))
            $('#tl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
        if (!$('#tl' + index + '-1').hasClass('btn-success'))
            $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
        $('#tl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
        feeds[index].send({message: {request: "configure", temporal: 0}});
    });

    $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Capping simulcast temporal layer, wait for it... (medium FPS)", null, {timeOut: 2000});
        if (!$('#tl' + index + '-2').hasClass('btn-success'))
            $('#tl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
        $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-info');
        if (!$('#tl' + index + '-0').hasClass('btn-success'))
            $('#tl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
        feeds[index].send({message: {request: "configure", temporal: 1}});
    });

    $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
        console.log("Capping simulcast temporal layer, wait for it... (highest FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
        if (!$('#tl' + index + '-1').hasClass('btn-success'))
            $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
        if (!$('#tl' + index + '-0').hasClass('btn-success'))
            $('#tl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
        feeds[index].send({message: {request: "configure", temporal: 2}});
    });
}

function updateSimulcastButtons(feed, substream, temporal) {
    // Check the substream
    var index = feed;
    if (substream === 0) {
        console.log("Switched simulcast substream! (lower quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
    } else if (substream === 1) {
        console.log("Switched simulcast substream! (normal quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    } else if (substream === 2) {
        console.log("Switched simulcast substream! (higher quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    }
    // Check the temporal layer
    if (temporal === 0) {
        console.log("Capped simulcast temporal layer! (lowest FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
    } else if (temporal === 1) {
        console.log("Capped simulcast temporal layer! (medium FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    } else if (temporal === 2) {
        console.log("Capped simulcast temporal layer! (highest FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    }
}
