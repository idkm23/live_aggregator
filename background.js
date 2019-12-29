'use strict';

var streamer_objs = [];
var twitch_streamer_objs = [];
var mixer_streamer_objs = [];
var youtube_streamer_objs = [];

var cached_ytcfg = {};

var streamer_objs_promise;

function getCookie(cookie_url, cookie_name) {
  return new Promise((resolve, reject) => {
    let options = {
      url: cookie_url,
      name: cookie_name
    };
    chrome.cookies.get(
      options,
      ({value: cookie}) => {
        resolve(cookie);
      }
    );
  });
}

function makeRestRequest(options) {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url, true);
    for (let header_key in options.headers) {
      xhr.setRequestHeader(header_key, options.headers[header_key]);
    }

    xhr.onreadystatechange = () => {
      if (xhr.status == 200) {
        if (xhr.readyState == XMLHttpRequest.DONE) {
          resolve((options.json ?
              JSON.parse(xhr.responseText) : xhr.responseText));
        }
      } else {
        let e =
            `Error ${xhr.status}: ${xhr.statusText} to url: ${options.url}`;
        reject(e);
      }
    };

    xhr.send(JSON.stringify(options.data));
  });
}

function makeTwitchRestRequest(auth_token) {
  return makeRestRequest({
    method: 'POST',
    url: 'https://gql.twitch.tv/gql',
    headers: {
      'Authorization': 'OAuth ' + auth_token,
      'Content-Type': 'text/plain;charset=UTF-8',
      'cache-control': 'no-cache',
      'Set-Cookie': 'SameSite=None; Secure',
    },
    data: [{
      'operationName':'FollowedChannels',
      'variables': {
        'limit': 100
       },
       'extensions': {
         'persistedQuery': {
           'version': 1,
           'sha256Hash':
            'f5e7de43821b57e94721d314c1439a13a732fc148b3f09e914c7b00c9167463a'
         }
       }
    }],
    json: true
  });
}

function makeMixerRestRequest() {
  return makeRestRequest({
    method: 'GET',
    url:
      'https://mixer.com/api/v1/users/67550712/follows?limit=32&page=0&order=online:desc,viewersCurrent:desc,token:desc',
    headers: {},
    json: true
  });
}

// Scrapes auth data from the user's youtube to make the request.
function fetchYtcfg() {
  return new Promise((resolve, reject) => {
    if (Object.keys(cached_ytcfg).length > 0) {
      resolve(cached_ytcfg);
    };

    makeRestRequest({
      method: 'GET',
      url: 'https://www.youtube.com',
      headers: {}
    })
      .then((response) => {
        var fake_html = document.createElement('html');
        fake_html.innerHTML = response;
        Array.prototype.slice.call(fake_html.getElementsByTagName('script')).forEach(script => {
          let script_str = script.innerHTML;
          if (script_str.includes('XSRF_TOKEN')) {
            let xsrf_matches = script_str.match(new RegExp('"XSRF_TOKEN":"([a-zA-Z0-9]+=)"'));
            let client_matches = script_str.match(new RegExp('"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\\d.]+)"'));
            if (xsrf_matches.length == 2 && client_matches.length == 2) {
              cached_ytcfg['XSRF_TOKEN'] = xsrf_matches[1];
              cached_ytcfg['INNERTUBE_CONTEXT_CLIENT_VERSION'] = client_matches[1];
              resolve(cached_ytcfg);
            }
          }
      });
      reject("Couldn't fetch YouTube ytcfg.");
    });
  });
}

function fetchFollowedYouTubeChannels(ytcfg) {
  return makeRestRequest({
    method: 'GET',
    url:
      'https://www.youtube.com/guide_ajax?action_load_guide=1',
    headers: {
      'x-youtube-client-name': '1',
      'x-youtube-identity-token': ytcfg['XSRF_TOKEN'],
      'x-youtube-client-version': ytcfg['INNERTUBE_CONTEXT_CLIENT_VERSION']
    },
    json: true
  });
}

function fetchYouTubeLiveViewCount(channels) {
  return makeRestRequest({
  });
}

function fetchTwitchStreamerObjs() {
  return new Promise((resolve, reject) => {
    // Need to fetch a cookie and put it as a (weird) header to our request.
    getCookie('https://twitch.tv', 'auth-token')
      .then((auth_token) => makeTwitchRestRequest(auth_token))
      .then((twitch_response) => {
        let followed_live_users =
            twitch_response[0]['data']['currentUser']['followedLiveUsers']['nodes'];
        let new_streamer_objs = [];
        followed_live_users.forEach(live_user => {
          if (live_user['stream']['type'] == 'rerun') {
            return;
          }

          // Can be null if streamer is not under a category.
          let game_dict = live_user['stream']['game'];
          let game_title = '';
          if (game_dict) {
            game_title = game_dict['displayName'];
          }

          new_streamer_objs.push({
            avatar: live_user['profileImageURL'],
            name: live_user['displayName'],
            game: game_title,
            view_count: live_user['stream']['viewersCount'],
            link: 'https://twitch.tv/' + live_user['login'],
            platform: Platform.TWITCH
          });
        });
        twitch_streamer_objs = new_streamer_objs;
        resolve(twitch_streamer_objs);
      })
      .catch(error => {
        console.log("Unable to reach Twitch: ", error);
        resolve([]);
      });
  });
}

function fetchMixerStreamerObjs() {
  return new Promise((resolve, reject) => {
    // Cookies set automatically by browser.
    makeMixerRestRequest()
      .then((mixer_response) => {
        let new_streamer_objs = [];
        mixer_response.forEach(live_user => {
          if (live_user['online']) {
            new_streamer_objs.push({
              avatar: live_user['user']['avatarUrl'],
              name: live_user['user']['username'],
              game: live_user['type']['name'],
              view_count: live_user['viewersCurrent'],
              link: 'https://mixer.com/' + live_user['user']['username'],
              platform: Platform.MIXER
            });
          }
        });
        mixer_streamer_objs = new_streamer_objs;
        resolve(mixer_streamer_objs);
      })
      .catch(error => {
        console.log("Unable to reach Mixer: ", error);
        resolve([]);
      });
  });
}

function buildYoutubeObj(renderer) {
  if (renderer['badges'] && renderer['badges']['liveBroadcasting']) {
    try {
      return {
        avatar: renderer['thumbnail']['thumbnails'][0]['url'],
        name: renderer['title'],
        game: '', // No easy API for this.
        view_count: 0, // No easy API for this.
        link: 'https://youtube.com/channel/'
          + renderer['navigationEndpoint']['browseEndpoint']['browseId']
          + '/live',
        platform: Platform.YOUTUBE
      };
    } catch(e) {
      console.err('Failed to build youtube obj for: ' + renderer);
    }
  }
}
function fetchYoutubeStreamerObjs() {
  return new Promise((resolve, reject) => {
    fetchYtcfg()
      .then((ytcfg) => fetchFollowedYouTubeChannels(ytcfg))
      .then((youtube_response) => {
        let new_streamer_objs = [];
        youtube_response['response']['items'].forEach(item => {
          let subs = item['guideSubscriptionsSectionRenderer'];
          if (subs) {
            subs['items'].forEach(item => {
              let guideEntry = item['guideEntryRenderer'];
              if (guideEntry) {
                let youtube_obj = buildYoutubeObj(guideEntry);
                if (youtube_obj) {
                  new_streamer_objs.push(youtube_obj);
                }
              }

              let hidden_subs = item['guideCollapsibleEntryRenderer'];
              if (hidden_subs) {
                hidden_subs['expandableItems'].forEach(item => {
                  let guideEntry = item['guideEntryRenderer'];
                  if (guideEntry) {
                    let youtube_obj = buildYoutubeObj(guideEntry);
                    if (youtube_obj) {
                      new_streamer_objs.push(youtube_obj);
                    }
                  }
                });
              }
            });
          }
        });
        youtube_streamer_objs = new_streamer_objs;
        resolve(youtube_streamer_objs);
      })
      .catch(error => {
        console.log("Unable to reach YouTube: ", error);
        resolve([]);
      });
  });
}

function fetchStreamerObjs() {
  return new Promise(async (resolve, reject) => {
    let twitch_promise = fetchTwitchStreamerObjs();
    let mixer_promise = fetchMixerStreamerObjs();
    let youtube_promise = fetchYoutubeStreamerObjs();

    await twitch_promise;
    await mixer_promise;
    await youtube_promise;

    streamer_objs = twitch_streamer_objs
      .concat(mixer_streamer_objs)
      .concat(youtube_streamer_objs);
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

async function waitForStreamerObjs() {
  if (streamer_objs.length === 0) {
    await streamer_objs_promise;
  }
  return streamer_objs;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.topic === 'getStreamerObjs') {
    waitForStreamerObjs().then(sendResponse);
  }
  return true;
});

streamer_objs_promise = fetchStreamerObjs();
setInterval(() => {
  streamer_objs_promise = fetchStreamerObjs();
}, 15000);
