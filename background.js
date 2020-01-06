'use strict';

import { getCookie, makeRestRequest, Platform } from './util.js';
import { TwitchFetcher } from './twitch.js';
import { MixerFetcher } from './mixer.js';
import { YoutubeFetcher } from './youtube.js';

var twitch_fetcher = new TwitchFetcher();
var mixer_fetcher = new MixerFetcher();
var youtube_fetcher = new YoutubeFetcher();
var streamer_objs = [];

var streamer_objs_promise;

function fetchStreamerObjs() {
  return new Promise(async (resolve, reject) => {
    let twitch_promise = twitch_fetcher.fetchStreamerObjs();
    let mixer_promise = mixer_fetcher.fetchStreamerObjs();
    let youtube_promise = youtube_fetcher.fetchStreamerObjs();

    await twitch_promise;
    await mixer_promise;
    await youtube_promise;

    streamer_objs = twitch_fetcher.streamer_objs
      .concat(mixer_fetcher.streamer_objs)
      .concat(youtube_fetcher.streamer_objs);
    chrome.browserAction.setBadgeText({text: streamer_objs.length.toString()});

    streamer_objs = streamer_objs.sort((a, b) => {
      if (a.view_count > b.view_count) {
        return -1;
      }
      return 1;
    });

    resolve(streamer_objs);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({})],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
});

async function waitForLiveData() {
  if (streamer_objs.length === 0) {
    await streamer_objs_promise;
  }
  return {
    streamer_objs: streamer_objs,
    twitch_streamer_objs: twitch_fetcher.streamer_objs,
    mixer_streamer_objs: mixer_fetcher.streamer_objs,
    youtube_streamer_objs: youtube_fetcher.streamer_objs,
    twitch_status: twitch_fetcher.status,
    mixer_status: mixer_fetcher.status,
    youtube_status: youtube_fetcher.status
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.topic === 'getStreamerObjs') {
    waitForLiveData().then(sendResponse);
  }
  return true;
});

streamer_objs_promise = fetchStreamerObjs();
setInterval(() => {
  streamer_objs_promise = fetchStreamerObjs();
}, 15000);
