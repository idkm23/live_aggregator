'use strict';

import Platform from './util.js';

function sendMessagePromise(topic) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({topic: topic}, response => {
      if (response) {
        resolve(response);
      } else {
        reject('Failed to sendMessage for topic: ', topic);
      }
    });
  });
}

function addStreamToExtensionPopup(stream_obj, ol) {
  let live_row = $(`
    <a href='${stream_obj.link}' title='${stream_obj.stream_title}'>
      <li class='live-row'>
        <img class='stream-avatar' src='${stream_obj.avatar}' />
        <div class='live-row-text-panel'>
          <div class='name-and-game'>
            <div class='stream-name'>${stream_obj.name}</div>
            <div class='stream-game'>${stream_obj.game}</div>
          </div>
          <div class='view-count-panel-wrap'>
            <div class='view-count-panel'>
              <i class='live-symbol ${stream_obj.platform}-live-symbol'></i>
              <div class='view-count-text'>${numFormatter(stream_obj.view_count)}</div>
            </div>
          </div>
        </div>
      </li>
    </a>
  `);
  live_row.click(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      let current_domain = new URL(tabs[0].url).hostname;
      if (current_domain.endsWith('twitch.tv') ||
          current_domain.endsWith('youtube.com') ||
          current_domain.endsWith('mixer.com') ||
          current_domain == 'newtab') {
        chrome.tabs.update({url: live_row.attr('href')});
      } else {
        chrome.tabs.create({url: live_row.attr('href')});
      }
    });
  });

  ol.append(live_row);
}

function numFormatter(num) {
  if (typeof num == 'string') {
    return 0;
  }
  if (num >= 1000000) {
    return Math.round(num/100000)/10 + 'M';
  } else if (num >= 1000) {
    return Math.round(num/100)/10 + 'K';
  } else {
    return num;
  }
}

var twitch_status_div = document.getElementById('twitch-status-wrap');
var mixer_status_div = document.getElementById('mixer-status-wrap');
var youtube_status_div = document.getElementById('youtube-status-wrap');
function updateStatuses(live_data) {
  function updateStatus(status_div, status_bool, platform, stream_count) {
    if (status_bool) {
      status_div.setAttribute('title',
        `${stream_count} live on ${platform}`);
      status_div.classList.remove('status-fail');
      status_div.classList.add('status-success');
    } else {
      status_div.setAttribute('title', `Failed to reach ${platform}, or you're not logged in.`);
      status_div.classList.remove('status-success');
      status_div.classList.add('status-fail');
    }
  }
  updateStatus(twitch_status_div, live_data.twitch_status, 'Twitch',
    live_data.twitch_streamer_objs.length);
  updateStatus(mixer_status_div, live_data.mixer_status, 'Mixer',
    live_data.mixer_streamer_objs.length);
  updateStatus(youtube_status_div, live_data.youtube_status, 'YouTube',
    live_data.youtube_streamer_objs.length);
}

var mouseover_scroll_fn;
function getStreamerObjsAndUpdatePopup() {
  sendMessagePromise('getStreamerObjs').then((live_data) => {
    // Fix height so there isn't any crazy height adjustments until after we
    // update.
    $('#live-list').css('height', $('#live-list').height());
    $('#live-list').empty();
    live_data.streamer_objs.forEach((streamer_obj) => {
      addStreamToExtensionPopup(streamer_obj, $('#live-list'));
    });

    $('#spinner').css('display', 'none');
    if (live_data.streamer_objs.length == 0) {
      if (!live_data.twitch_status &&
          !live_data.mixer_status &&
          !live_data.youtube_status) {
        $('.slimScrollDiv').css('display', 'none');
        $('#empty-list-msg').css('display', 'none');
        $('#no-login-msg').css('display', 'block');
      } else {
        $('.slimScrollDiv').css('display', 'none');
        $('#empty-list-msg').css('display', 'block');
        $('#no-login-msg').css('display', 'none');
      }
    } else {
      $('#no-login-msg').css('display', 'none');
      $('#empty-list-msg').css('display', 'none');
      $('.slimScrollDiv').css('display', 'block');
    }

    // Remove slimScroll if the container is below the max height. Uses
    // insanely gross jQuery hacks to disable/enable scroll events.
    let event_fns = $._data($('#live-list')[0], 'events');
    if (live_data.streamer_objs.length <= 9) {
      // Save the scrollwheel visibility event for later when we need it.
      if (mouseover_scroll_fn === undefined) {
        mouseover_scroll_fn = event_fns.mouseover;
      }
      event_fns.mouseover = undefined;
      $('.scroll-bar').css('display', 'none');
    } else if (mouseover_scroll_fn) {
      event_fns.mouseover = mouseover_scroll_fn;
    }

    // Force the heights of related slimScroll containers because the library
    // is trash.
    $('#live-list').css('height', 'auto');
    $('.slimScrollDiv').css('height', 'auto');
    updateStatuses(live_data);
  });
}

$(() => {
  $('#live-list').slimScroll({
    height: 'auto',
    size: '6px',
    color: 'rgb(31, 31, 35)',
    barClass: 'scroll-bar',
    opacity: 0.7
  });
});

getStreamerObjsAndUpdatePopup();
setInterval(() => getStreamerObjsAndUpdatePopup(), 6000);
