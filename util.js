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

export {
  Platform, makeRestRequest, getCookie
};
export default {};
