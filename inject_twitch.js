'use strict';

const LIVE_ENTRY_CLASS = '.side-nav-section .tw-relative.tw-transition-group';

// Dynamic imports because content_scripts suck.
var GetStreamerObjs;
var numFormatter;

// Non-twitch streamer_objs.
var streamer_objs = [];
const main = async () => {
  while (true) {
    let live_data = await GetStreamerObjs.get();
    streamer_objs = live_data.mixer_info.streamer_objs.concat(
        live_data.youtube_info.streamer_objs);
    refreshSidebar(streamer_objs, 'NEW_LIVE_DATA');
  }
};

const unformatNum = num_str => {
  if (num_str.toLowerCase() == 'offline') {
    return -1;
  }
  let modifier_r = num_str.match(new RegExp('[KM]'));
  let modifier = 1;
  if (modifier_r === null) {
    return parseInt(num_str);
  } else if (modifier_r[0] == 'K') {
    modifier = 1000;
  } else if (modifier_r[0] == 'M') {
    modifier = 1000000;
  }
  let number_r = num_str.match(new RegExp('[0-9]+(?:\\.[0-9]+)?'));
  let number = 0;
  if (number_r) {
    number = parseFloat(number_r[0]);
  }

  return number * modifier;
};

const createFollowedChannelElement = streamer_obj => {
  return $(`
      <div class="live-agg-followed-channel tw-transition tw-transition--duration-medium tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done" style="transition-property: transform, opacity; transition-timing-function: ease;">
        <div>
          <div class="side-nav-card tw-align-items-center tw-flex tw-relative">
            <a class="side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-interactive tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05" data-a-id="followed-channel-1" data-a-target="followed-channel" href="${streamer_obj.link}">
              <div class="side-nav-card__avatar tw-align-items-center tw-flex-shrink-0">
                <figure aria-label="${streamer_obj.name}" class="tw-avatar tw-avatar--size-30"><img class="tw-block tw-border-radius-rounded tw-image tw-image-avatar" alt="${streamer_obj.name}" src="${streamer_obj.avatar}"></figure>
              </div>
              <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                  <div class="side-nav-card__title tw-align-items-center tw-flex">
                    <p class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold" data-a-target="side-nav-title" title="${streamer_obj.stream_title}">${streamer_obj.name}</p>
                  </div>
                  <div data-a-target="side-nav-game-title" class="side-nav-card__metadata tw-pd-r-05">
                    <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading" title="${streamer_obj.stream_title}">${streamer_obj.game}</p>
                  </div>
                </div>
                <div data-a-target="side-nav-live-status" class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05">
                  <div class="tw-align-items-center tw-flex">
                    <div class="live-agg-platform-color-${streamer_obj.platform} tw-border-radius-rounded tw-channel-status-indicator tw-channel-status-indicator--live tw-channel-status-indicator--small tw-inline-block tw-relative"></div>
                    <div class="tw-mg-l-05"><span class="tw-c-text-alt tw-font-size-6">${numFormatter(streamer_obj.view_count)}</span></div>
                  </div>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    `);
};

const showMore = () => {
  $('.side-nav button[data-a-target="side-nav-show-more-button"]').first().trigger('click');
};

var streamer_objs = [];
const addStreamerObjs = streamer_objs => {
  streamer_objs.forEach(streamer_obj => {
    let fake_live_entry = createFollowedChannelElement(streamer_obj);
    let keep_searching = true;
    let old_length = $(LIVE_ENTRY_CLASS).children();

    $(LIVE_ENTRY_CLASS).children().each((i, live_entry_elem) => {
      $(live_entry_elem).find('.side-nav-card__live-status span').each((i, elem) => {
        let view_count = unformatNum($(elem).text());
        if (streamer_obj.view_count > view_count) {
          fake_live_entry.insertBefore($(live_entry_elem));
          keep_searching = false;
        }
        return keep_searching;
      });
      if (keep_searching) {
        fake_live_entry.insertBefore($(live_entry_elem));
      }
      return keep_searching;
    });
  });
};

var is_refreshSidebar_locked = false;
var is_sidebar_ready = false;
const refreshSidebar = (streamer_objs, debug_caller) => {
  if (is_refreshSidebar_locked || !is_sidebar_ready) {
    return;
  }
  is_refreshSidebar_locked = true;
  setTimeout(() => {
    is_refreshSidebar_locked = false;
  }, 1500);
  console.log(`Live-Aggregator: Updating sidebar (reason: ${debug_caller}`));

  $(LIVE_ENTRY_CLASS).find('.live-agg-followed-channel').remove();
  addStreamerObjs(streamer_objs);
};

var sidebar_watcher;
$(document).ready(() => {
  // Dynamic import because we can't make content scripts modules.
  (async () => {
    const src = chrome.runtime.getURL("./util.js");
    let util = await import(src);
    GetStreamerObjs = util.GetStreamerObjs;
    numFormatter = util.numFormatter;
  })().then(() => {
    // Monitor when twitch updates sidebar, so we can reupdate.
    sidebar_watcher = new window.MutationObserver(mutations => {
      if (!is_sidebar_ready) {
        showMore();
        is_sidebar_ready = true;
      }
      refreshSidebar(streamer_objs, 'MUTATOR');
    });

    sidebar_watcher.observe(
      document.getElementsByClassName('side-nav-section')[0],
      {childList: true, subtree: true, characterData: true});

    main();
  });
});
