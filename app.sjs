/*
  This is more of a scaffold than a proper twitter client.
 
  It lacks any sophistication and basically just allows you to sign-in
  and tweet, it shows and auto-updates your timeline, and it loads older
  tweets when you scroll down the page.
  It's easy to extend, so go on and hack it :-)
  
  Oh, and IT RUNS COMPLETELY CLIENT-SIDE. There is no server code involved.
  It talks to twitter directly. You don't even need a proper domain to
  run it from; you can serve it from 'localhost'. E.g. if you have a Mac,
  you can serve it via Personal Web Sharing - see
  http://www.macinstruct.com/node/112 .
 
  * HOW TO GET A TWITTER APPLICATION ID:
 
  Log into twitter and go to http://dev.twitter.com/apps/ .
  Register a new application, setting the 'Callback URL' to the site where
  your app will live (this can be 'http://localhost'!). 
  Set the 'Default Access type' to 'Read & Write'.
  Then change the application id below to the @Anywhere API key of your app.
 
  * ABOUT STRATIFIED JAVASCRIPT / ONI APOLLO:
 
  Oni Apollo, the library that we use here, allows you to make calls to
  the Twitter API directly from the client in a NON-CALLBACK style.
  See http://onilabs.com/api#twitter.
  It allows you to call any function in the standard RESTful Twitter API
  (see http://dev.twitter.com/doc) in this way:
 
     var result = T.call("statuses/home_timeline", params);
 
  StratifiedJS is the extended JS used by Oni Apollo to make the
  non-callback style possible (and more!). See http://stratifiedjs.org/sjsdocs.
 
*/
 
var API_KEY = "tlgTd1dcnnFb5oc8DQtMQ";
 
//----------------------------------------------------------------------
// Initialization
  
// Load the @Anywhere API and init with your application id:
var T = require("apollo:twitter").initAnywhere({id:API_KEY});
 
// We'll use jquery; load it from Google's CDN and install stratified
// bindings ($click, etc):
require("apollo:jquery-binding").install();
 
// We'll also use various methods from the common module (supplant, ...)
var common = require("apollo:common");
 
var tweeting_button = $("#tweeting_button");
var status_el = $("#status");
var counter = $("#tweeting_status");

//----------------------------------------------------------------------
// main program loop
 
// Show the twitter connect button:
T("#login").connectButton();
// Run our application logic in an endless loop:
while (true) {
  try {
    main();
  }
  catch(e) {
    alert("Error:"+e);
  }
}

//----------------------------------------------------------------------
// main application logic:
 
function main() {
  // First wait until we're connected:
  if (!T.isConnected())
    T.waitforEvent("authComplete");
  $("#login").hide();
  $("#welcome").hide();
  $("#timeline").empty();
  
  try {
    // Let's set the last tweet and the background based on the
    // user's prefs:
    var profile = T.call("users/show", {user_id: T.currentUser.id});
    $("#current_user").text(profile.screen_name);
    $("#current_user").prepend("<img src='"+profile.profile_image_url + "'/>");
    setLatestTweet(profile.status);
    $("body").css({
      background: common.supplant("#{color} url({image}) {repeat}", {
        color:  profile.profile_background_color,
        image:  profile.profile_background_image_url,
        repeat: profile.profile_background_tile ? "repeat" : "no-repeat"
      })
    });  
  
    // Now we'll do several things in parallel, by combining them with
    // the stratified construct waitfor/and:
    waitfor {
      waitfor_signout();
      // Now exit main(). The other clauses in the waitfor/and will
      // automatically be aborted cleanly (i.e. eventlisteners will be
      // removed, etc).
      return;
    }
    and {
      // Endlessly handle tweets by the user:
      tweet_loop();
    }
    and {
      // Endlessly update the timeline:
      update_timeline_loop();
    }
    and {
      // Endlessly load older tweets when the user scrolls down:
      show_more_loop();
    }
    and {
      ui_mute_loop();
    }
  }
  finally {
    // Clean up:
    $("#current_user").empty();
    $("#timeline").empty();
    $("#welcome").show();
    $("body").css({background:""});
  }
}

 
//----------------------------------------------------------------------
// Helper functions
 
function setLatestTweet(tweet) {
  $("#latest")[tweet?"show":"hide"]();
  if (tweet)
    $("#latest span").text(tweet.text);
}
 
// 'characters left' counter
function update_counter() {
  counter.text(140 - status_el.val().length);
}

function ui_mute_loop() {
  if (!window["localStorage"]) return;
  
  var filterArray = [];
  tweetFilter = function(tweet) {
    for (var i = filterArray.length; i >= 0; --i) {
      var keyword = filterArray[i];
      if (!keyword) continue;
      if (keyword.indexOf("@") == 0 && tweet.user.screen_name == keyword.substring(1)) return true;
      else if (tweet.text.indexOf(keyword) != -1) return true;
    }

    return false;
  };
  
  var button = $("<a href='#'>Mute list</a>").prependTo("#session_buttons");
  try {
    while(true) {
      filterArray = localStorage.mute ? localStorage.mute.split(" ") : [];
      button.$click();
      var rv = prompt("Enter a space-separated list of #keywords or @users you want to mute.", localStorage.mute);
      if (rv != null) {
        localStorage.mute = rv;
        $(window).trigger("settingschanged");
      }
    }
  } finally {
    button.remove();
  }
}
 
// Append/prepend a tweet to the timeline
function showTweet(tweet, append) {
  if (window["tweetFilter"] && tweetFilter(tweet)) return;

  var date = new Date(tweet.created_at.replace(/^\w+ (\w+) (\d+) ([\d:]+) \+0000 (\d+)$/,
                                               "$1 $2 $4 $3 UTC"));
  var elapsed = Math.round(((new Date()).getTime() - date.getTime()) / 60000);
  if (elapsed < 60) {
    var date_string = elapsed + " minutes";
  }
  else if (elapsed < 60*24) {
    var date_string = Math.round(elapsed / 60) + " hours";
  }
  else {
    var date_string = date.getDate() + "/" + date.getMonth();
  }

  if (tweet.entities && tweet.entities.urls) {
    for (var i = tweet.entities.urls.length - 1, entity; entity = tweet.entities.urls[i]; --i) {
      tweet.text = common.supplant("{a}<a target='_blank' href='{b}'>{b}</a>{c}", {
        a: tweet.text.substring(0, entity.indices[0]),
        b: entity.url,
        c: tweet.text.substring(entity.indices[1])
      });
    }
  }
  // Construct the html for the tweet. Note how we can use
  // multiline strings in StratifiedJS. We also use the
  // 'supplant' function from the 'common' module for getting
  // values into our string:
  $("#timeline")[append ? "append" : "prepend"](common.supplant("\
    <div class='timeline_item user_{screenname}'>
      <div class='tweet_wrapper' tweetid='{tweetid}'>
        <span class='tweet_thumb'>
          <img src='{image}' width='48' height='48'/>
        </span>
        <span class='tweet_body'>
          <span class='screenname'>{screenname}</span>
          <span class='content'>{text}</span>
          <span class='meta'>{meta}</span>
        </span>
      </div>
    </div>
    ", {
      tweetid: tweet.id,
      text: tweet.text, 
      image: tweet.user.profile_image_url,
      screenname: tweet.user.screen_name,
      meta: date_string
    }));
}
 
// Helper to fetch new tweets:
function fetch_tweets(params) {
  try {
    return T.call("statuses/home_timeline", params);
  }
  catch(e) {
    // Are we still connected? If not, quit the app:
    if (!T.isConnected())
      throw "Disconnected";
    // else try again in 10s:
    // XXX should really have a back-off algo here
    // XXX should examine exception object.
    hold(10*1000);
    return fetch_tweets(params);
  }
}
 
// Function that periodically fetches new tweets from twitter and
// displays them:
function update_timeline_loop() {
  // Run an endless loop:
  while (true) {
    // Fetch tweets from twitter:
    var timeline = fetch_tweets({
      include_entities: true,
      count: 30,
      since_id: $(".tweet_wrapper:first").attr("tweetid")
    });
 
    if (timeline && timeline.length) {
      // Prepend tweets to timeline:
      for (var i = timeline.length-1, tweet; tweet = timeline[i]; --i)
        showTweet(tweet, false);
    }

    waitfor {
      // Twitter is rate-limited to ~150calls/h. Wait for 60 seconds
      // until we fetch more tweets.
      hold(60*1000);
    }
    or {
      $(window).waitFor("settingschanged");
      $("#timeline").empty();
    }
  }
}
 
// Helper that waits until the user scrolls to the bottom of the page:
function waitforScrollToBottom() {
  do {
    $(window).$scroll();
  }
  while ($(document).height()- $(window).height() - $(document).scrollTop() > 300)
}
 
// Runs a loop that waits for the user to scroll to the bottom, and
// then loads more tweets:
function show_more_loop() {
  while (true) {
    waitforScrollToBottom();
 
    var timeline = null;
    waitfor {
      // show a cancel button:
      $("#timeline").append("\
        <div class='timeline_item loading_more'>
          Loading more tweets... click here to cancel
        </div>");
      // wait for it to be clicked; if that happens before the request
      // completes, the request will be cancelled, by virtue of the
      // waitfor/or.
      $(".timeline_item:last").$click();
    }
    or {
      timeline = fetch_tweets({
        count: 30,
        max_id: $(".tweet_wrapper:last").attr("tweetid")-1
      });
      if (!timeline.length) return; // we've loaded all tweets there are
    }
    finally {
      // remove the cancel button:
      $(".timeline_item:last").remove();
    }
    
    if (timeline && timeline.length) {
      // Append tweets to timeline:
      for (var i = 0, tweet; tweet = timeline[i]; ++i)
        showTweet(tweet, true);
    }
  }
}
 
// Runs an endless loop that checks for the 'tweet' button to be
// clicked and sends out a tweet if it is:
function tweet_loop() {
  try {
    $(".tweet_box").show();
    while (true) {
      tweeting_button.$click();
      tweeting_button.attr("disabled", "disabled");
      $("#tweeting_status").text("Tweeting...");
      try {
        var tweet = T.call("statuses/update", {status: status_el.val() });
        status_el.val("");
        showTweet(tweet);
        setLatestTweet(tweet);
      }
      catch (e) {
        alert("Error posting: " + e.response.error);
      }
      update_counter();
      tweeting_button.removeAttr("disabled");
    }
  }
  finally {
    $(".tweet_box").hide();
  }
}
 
// shows a signout button and blocks until it is clicked
function waitfor_signout() {
  try {
    // Show a signout button and wait for it to be clicked:
    var signout = $("<a href='#'>Sign out of twitter</a>").appendTo("#logout");
    var e = signout.$click();
    e.returnValue = false;
    e.preventDefault();
  
    // Ok, signout button was clicked; sign out, hide button & clear timeline:
    twttr.anywhere.signOut();
  }
  finally {
    signout.remove();
    $("#login").show();
  }
}