'use strict';

import { getCookie, makeRestRequest, Platform } from './util.js';

var i;

// Scrapes auth data from the user's youtube to make the request.
const fetchYtcfg = () => {
  return new Promise((resolve, reject) => {
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
            let xsrf_matches = script_str.match(
                new RegExp('"XSRF_TOKEN":"([a-zA-Z0-9]+=)"'));
            let client_matches = script_str.match(
                new RegExp('"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\\d.]+)"'));
            if (xsrf_matches.length == 2 && client_matches.length == 2) {
              resolve({
                XSRF_TOKEN: xsrf_matches[1],
                INNERTUBE_CONTEXT_CLIENT_VERSION: client_matches[1]
              });
            }
          }
      });
      reject('Couldn\'t fetch YouTube ytcfg.');
    })
    .catch(reject);
  });
};

const fetchFollowedChannels = ytcfg => {
  return makeRestRequest({
    method: 'GET',
    url:
      'https://www.youtube.com/guide_ajax?action_load_guide=1',
    headers: {
      'x-youtube-client-name': '1',
      'x-youtube-identity-token': ytcfg.XSRF_TOKEN,
      'x-youtube-client-version': ytcfg.INNERTUBE_CONTEXT_CLIENT_VERSION
    },
    json: true
  });
};

// Loads '.../channel/UC.../live' and returns {view_count:xx, title:xx}.
const fetchLiveWatchPageData = url => {
  return new Promise((resolve, reject) => {
    makeRestRequest({
      method: 'GET',
      url: url
    })
    .then(response => {
      let fake_html = document.createElement('html');
      fake_html.innerHTML = response;

      let watch_page_data = {};
      let title_elements = fake_html.getElementsByTagName('title');
      for (i = 0; i < title_elements.length; i++) {
        if (title_elements[i].text != 'YouTube') {
          watch_page_data.title = title_elements[i].text;
        }
      }
      Array.prototype.slice.call(fake_html.getElementsByTagName('script')).forEach(script => {
        let script_str = script.innerHTML;
        if (script_str.includes('watching now')) {
          let viewers_matches = script_str.match(
              new RegExp('([\\d,]+)\ watching\ now'));
          if (viewers_matches.length >= 2) {
            watch_page_data.view_count = parseInt(viewers_matches[1].replace(',', ''));
            resolve(watch_page_data);
          } else {
            reject(`Failed to regex view count for ${url}`);
          }
        }
      });
    })
    .catch(reject);
  });
};

const buildStreamerObj = renderer => {
  if (renderer.badges && renderer.badges.liveBroadcasting) {
    return {
      avatar: renderer.thumbnail.thumbnails[0].url,
      name: renderer.title,
      game: '', // No easy API for this.
      view_count: 0, // No easy API for this, filled later.
      link: 'https://www.youtube.com/channel/' +
        renderer.navigationEndpoint.browseEndpoint.browseId + '/live',
      platform: Platform.YOUTUBE
    };
  }
};

const isYtcfgValid = ytcfg => {
  return ytcfg.XSRF_TOKEN != null &&
    ytcfg.INNERTUBE_CONTEXT_CLIENT_VERSION != null;
};

class YoutubeFetcher {
  constructor() {
    // Whether the last fetch was successful.
    this.status = false;

    // The last retrieved streamer objects fetched. If there was a failure,
    // return [].
    this.streamer_objs = [];

    // Necessary to make authenticated requests.
    this._cached_ytcfg = {};
  }

  fetchStreamerObjs() {
    return new Promise((resolve, reject) => {
      this._getYtcfg()
        .then(fetchFollowedChannels)
        .then(follower_response => {
          let new_streamer_objs = [];
          let found_subs = false;
          follower_response.response.items.forEach(item => {
            let is_logged_in_but_no_subs_marker = item.guideSectionRenderer;
            if (is_logged_in_but_no_subs_marker &&
                is_logged_in_but_no_subs_marker.title == 'Subscriptions') {
              found_subs = true;
            }

            let subs = item.guideSubscriptionsSectionRenderer;
            if (subs) {
              subs.items.forEach(item => {
                let guideEntry = item.guideEntryRenderer;
                if (guideEntry) {
                  found_subs = true;
                  let streamer_obj = buildStreamerObj(guideEntry);
                  if (streamer_obj) {
                    new_streamer_objs.push(streamer_obj);
                  }
                }
  
                // Followed channels under 'Show More'.
                let hidden_subs = item.guideCollapsibleEntryRenderer;
                if (hidden_subs) {
                  hidden_subs.expandableItems.forEach(item => {
                    let guideEntry = item.guideEntryRenderer;
                    if (guideEntry) {
                      let streamer_obj = buildStreamerObj(guideEntry);
                      if (streamer_obj) {
                        new_streamer_objs.push(streamer_obj);
                      }
                    }
                  });
                }
              });
            }
          });
          if (found_subs) {
            this.status = true;
          } else {
            this.status = false;
          }
          this.streamer_objs = new_streamer_objs;
          return this.streamer_objs;
        }).then(new_streamer_objs => {
          let watch_page_promises = [];
          new_streamer_objs.forEach(streamer_obj => {
            watch_page_promises.push(
              fetchLiveWatchPageData(streamer_obj.link));
          });
          return Promise.all(watch_page_promises);
        }).then(watch_page_data => {
          for (i = 0; i < watch_page_data.length; i++) {
            this.streamer_objs[i].view_count = 
                watch_page_data[i].view_count;
            this.streamer_objs[i].stream_title =
                watch_page_data[i].title;
          }
          resolve(this.streamer_objs);
        })
        .catch(error => {
          console.log('Unable to reach YouTube: ', error);
          this.status = false;
          this.streamer_objs = [];
          // Dump ytcfg incase it is responsible.
          this._cached_ytcfg = {};
          resolve(this.streamer_objs);
        });
    });
  }

  // If cached, return the cached YTCFG. Otherwise, fetch a new one and update
  // __cached_ytcfg.
  _getYtcfg() {
    return new Promise((resolve, reject) => {
      if (isYtcfgValid(this._cached_ytcfg)) {
        resolve(this._cached_ytcfg);
      } else {
        fetchYtcfg()
          .then(ytcfg => {
            if (isYtcfgValid(ytcfg)) {
              this._cached_ytcfg = ytcfg;
              resolve(this._cached_ytcfg);
            } else {
              // If its still broken, fail.
              reject('Unable to build ytcfg.');
            }
          })
          .catch(reject);
      }
    });
  }
}


export {YoutubeFetcher};
