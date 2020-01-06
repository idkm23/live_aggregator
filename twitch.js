'use strict';

import { getCookie, makeRestRequest, Platform } from './util.js';

const fetchFollowedChannels = auth_token => {
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
  };

const responseToStreamerObjs = followers_response => {
    let followed_live_users =
        followers_response[0].data.currentUser.followedLiveUsers.nodes;
    let new_streamer_objs = [];
    followed_live_users.forEach(live_user => {
      if (live_user.stream.type == 'rerun') {
        return;
      }
 
      // Can be null if streamer is not under a category.
      let game_dict = live_user.stream.game;
      let game_title = '';
      if (game_dict) {
        game_title = game_dict.displayName;
      }
 
      new_streamer_objs.push({
        avatar: live_user.profileImageURL,
        name: live_user.displayName,
        stream_title: live_user.stream.title,
        game: game_title,
        view_count: live_user.stream.viewersCount,
        link: 'https://www.twitch.tv/' + live_user.login,
        platform: Platform.TWITCH
      });
    });
    return new_streamer_objs;
  };

class TwitchFetcher {
  constructor() {
    // Whether the last fetch was successful.
    this.status = false;

    // The last retrieved streamer objects fetched. If there was a failure,
    // return [].
    this.streamer_objs = [];
  }

  // Gets a cookie and sends a request to their live follower list.
  // Returns: Promise which resolves when all calls are complete.
  fetchStreamerObjs() {
    return new Promise((resolve, reject) => {
      // Need to fetch a cookie and put it as a (weird) header to our request.
      getCookie('https://twitch.tv', 'auth-token')
        .then(fetchFollowedChannels)
        .then(followers_response => {
          this.streamer_objs = responseToStreamerObjs(followers_response);
          this.status = true;
          resolve(this.streamer_objs);
        })
        .catch(error => {
          console.log('Unable to reach Twitch: ', error);
          this.status = false;
          this.streamer_objs = [];
          resolve(this.streamer_objs);
        });
    });
  }

}

export {TwitchFetcher};
