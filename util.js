'use strict';

const Platform = {
  TWITCH: 'twitch',
  MIXER: 'mixer',
  YOUTUBE: 'youtube'
};

const getCookie = (cookie_url, cookie_name) => {
  return new Promise((resolve, reject) => {
    let options = {
      url: cookie_url,
      name: cookie_name
    };
    chrome.cookies.get(
      options,
      cookie => {
        if (cookie) {
          resolve(cookie.value);
        } else {
          reject(`Can't get cookie: ${cookie_name}`);
        }
      }
    );
  });
};

const makeRestRequest = options => {
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
        reject(
          `Error ${xhr.status}: ${xhr.statusText} to url: ${options.url}`);
      }
    };

    xhr.send(JSON.stringify(options.data));
  });
};

const sendMessagePromise = (topic, data) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      topic: topic,
      data: data
    }, response => {
      if (response) {
        resolve(response);
      } else {
        console.log(response);
        reject(`Failed to sendMessage for '${topic}' with ${response}`);
      }
    });
  });
};

// Retrieves streamer objs immediately on the first iteration so we can put
// data infront of the user ASAP. Subsequent calls block until we get an
// update from background.
class GetStreamerObjs {
  static _is_first_run = true;
  static get() {
    let method;
    if (GetStreamerObjs._is_first_run) {
      method = 'getStreamerObjs';
      GetStreamerObjs._is_first_run = false;
    } else {
      method = 'getNewStreamerObjs';
    }
    return sendMessagePromise(method);
  }
}

const timeout = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const numFormatter = num => {
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

export {
  Platform, makeRestRequest, getCookie, sendMessagePromise, GetStreamerObjs,
  timeout, numFormatter
};
export default {};
