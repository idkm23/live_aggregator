'use strict';

import {
  Platform, GetStreamerObjs, numFormatter, sendMessagePromise
} from './util.js';

var first_run = true;

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
      status_div.setAttribute('title', `Failed to reach ${platform}, or you're not logged in`);
      status_div.classList.remove('status-success');
      status_div.classList.add('status-fail');
    }
  }
  updateStatus(twitch_status_div, live_data.twitch_info.status, 'Twitch',
    live_data.twitch_info.streamer_objs.length);
  updateStatus(mixer_status_div, live_data.mixer_info.status, 'Mixer',
    live_data.mixer_info.streamer_objs.length);
  updateStatus(youtube_status_div, live_data.youtube_info.status, 'YouTube',
    live_data.youtube_info.streamer_objs.length);
}

var mouseover_scroll_fn;
function getStreamerObjsAndUpdatePopup() {
  return GetStreamerObjs.get().then((live_data) => {
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
        $('#live-list').css('display', 'none');
        $('#empty-list-msg').css('display', 'none');
        $('#no-login-msg').css('display', 'block');
      } else {
        $('#live-list').css('display', 'none');
        $('#empty-list-msg').css('display', 'block');
        $('#no-login-msg').css('display', 'none');
      }
    } else {
      $('#no-login-msg').css('display', 'none');
      $('#empty-list-msg').css('display', 'none');
      $('#live-list').css('display', 'block');
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
  $('#live-list').css('height', 'auto');
  $('.slimScrollDiv').css('height', 'auto');

  var is_yepping = false;
  $('#logo').hover(
    () => {
      is_yepping = true;
      $('#logo').attr('src', 'images/YEPPERS.gif');
    },
    () => {
      is_yepping = false;
      $('#logo').attr('src', 'images/live_aggregator.png');
    });

  // Make pepe look at user randomly.
  setInterval(() => {
    if (!is_yepping && Math.random() < 0.4) {
      $('#logo').attr('src', 'images/live_aggregator_stare.png');
      setTimeout(() => {
        if (!is_yepping) {
          $('#logo').attr('src', 'images/live_aggregator.png');
        }
      }, 5000);
    }
  }, 10000);

  var in_settings = false;
  $('#settings-icon').click(() => {
    if (in_settings) {
      in_settings = false;
      $('#settings-menu').css('display', 'none');
      $('#live-list-loading-and-messages').css('display', 'block');

      $('#settings-icon').css('box-shadow', 'none');
    } else {
      in_settings = true;
      $('#settings-menu').css('display', 'block');
      $('#live-list-loading-and-messages').css('display', 'none');

      $('#settings-icon').css('box-shadow',
        'rgb(119, 44, 232) 0px 0px 6px 0px');
      $('#settings-icon').css('background-color',
        'rgba(255, 255, 255, 0.15)');
    }
  });
  $('#settings-icon').mouseover(() => {
    $('#settings-icon').css('background-color',
      'rgba(255, 255, 255, 0.15)');
  }).mouseout(() => {
    if (!in_settings) {
      $('#settings-icon').css('background-color', 'initial');
      $('#settings-icon').css('box-shadow', 'initial');
    }
  });
  $('#settings-icon').mousedown(() => {
    $('#settings-icon').css('box-shadow',
      'rgb(119, 44, 232) 0px 0px 6px 0px');
  });
  $('#settings-icon').mouseup(() => {
    $('#settings-icon').css('box-shadow', 'initial');
  });

  chrome.storage.sync.get('twitch_sidebar_injection', function(data) {
    if (data.twitch_sidebar_injection) {
      $('#twitch-sidebar-injection').prop('checked', true);
    }
    $('#twitch-sidebar-injection').on('change', () => {
      let injection_setting = $('#twitch-sidebar-injection').is(':checked');
      sendMessagePromise('updateSidebarInjectionFlag', injection_setting);
      chrome.storage.sync.set({
        twitch_sidebar_injection: injection_setting
      });
    });
  });
});

const main = async () => {
  while (true) {
    await getStreamerObjsAndUpdatePopup();
  }
};

main();
