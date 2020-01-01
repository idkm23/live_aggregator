'use strict';

import Platform from './util.js';

var live_list = document.getElementById('live-list');
var spinner = document.getElementById('spinner');

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

function htmlToElement(html) {
  let template = document.createElement('template');
  html = html.trim();
  template.innerHTML = html;
  return template.content.firstChild;
}

function addStreamToExtensionPopup(stream_obj, ol) {
  let live_row = htmlToElement(`
    <a href='${stream_obj.link}'>
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
  live_row.onclick = () => {
    chrome.tabs.create({url: live_row.href});
  };

  ol.appendChild(live_row);
}

function numFormatter(num) {
  if (typeof num == "string") {
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

function getStreamerObjsAndUpdatePopup() {
  sendMessagePromise('getStreamerObjs').then((streamer_objs) => {
    let new_live_list = document.createElement('ol');
    new_live_list.id = 'live-list';
    streamer_objs.forEach((streamer_obj) => {
      addStreamToExtensionPopup(streamer_obj, new_live_list);
    });
    spinner.style.display = "none";

    let scroll_height = live_list.scrollTop;
    live_list.parentNode.replaceChild(new_live_list, live_list);
    live_list = new_live_list;
    live_list.scrollTop = scroll_height;
  });
}

getStreamerObjsAndUpdatePopup();
setInterval(() => getStreamerObjsAndUpdatePopup(), 1000);
