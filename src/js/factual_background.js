/**
 * @file Factual Background
 * @name Factual
 *
 * Factual extension background code.
 *
 * @author Alexandru Badiu <andu@ctrlz.ro>
 */
import md5 from 'crypto-js/md5';
import config from './config';
import FactualBase from './factual_base';
import { getUserToken } from './util';
require('../css/factual.scss');

class FactualBackground extends FactualBase {
  constructor() {
    super();
    console.info('[factchecker-plugin-chrome] Background init.');

    this.settings = {
      enabled: true,
      uid: '',
    };

    chrome.storage.sync.get('settings', (result) => {
      if (result) {
        this.settings = result.settings;
      }

      if (!this.settings.uid) {
        this.settings.uid = getUserToken();
        this.settingsUpdate();
      }

      console.log(`UID: ${this.settings.uid}`);

      this.setupEvents();
    });
  }

  toolbarClicked() {
    console.info('[factchecker-plugin-chrome] Toolbar clicked.');

    this.settings.enabled = !this.settings.enabled;

    this.settingsUpdate();
  }

  settingsChanged(changes) {
    console.info('[factchecker-plugin-chrome] Settings changed.');

    if (!_.isEqual(changes.settings.newValue, this.settings)) {
      this.settings = changes.settings.newValue;
      this.settingsPropagate();
    }
  }

  settingsUpdate() {
    chrome.storage.sync.set({
      settings: this.settings,
    }, () => {
      console.info('[factchecker-plugin-chrome] Settings saved.');
    });

    this.settingsPropagate();
  }

  settingsPropagate() {
    chrome.tabs.query({}, (tabs) => {
      const message = {
        sender: 'factual',
        action: 'settings_updated',
        msg: this.settings,
      };

      for (let i = 0; i < tabs.length; ++i) {
        chrome.tabs.sendMessage(tabs[i].id, message);
      }
    });
  }

  onMessage(request, sender, sendResponse) {
    console.info('[factchecker-plugin-chrome] Got message.');

    if (request.action === 'settings-get') {
      sendResponse(this.settings);
      return false;
    }

    if (request.action === 'facts-get') {
      this.getFacts(request.url)
        .then((facts) => {
          sendResponse(facts);
        });

      return true;
    }

    return false;
  }

  onUpdated(tabId, info) {
    if (info.status === 'complete') {
      chrome.tabs.sendMessage(tabId, {
        action: 'content-loaded',
      });
    }
  }

  setupEvents() {
    chrome.storage.onChanged.addListener((changes, namespace) => this.settingsChanged(changes, namespace));
    chrome.browserAction.onClicked.addListener(() => this.toolbarClicked());
    chrome.tabs.onUpdated.addListener((tabId, info) => this.onUpdated(tabId, info));
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => this.onMessage(request, sender, sendResponse));
  }

  getFacts(url) {
    return new Promise((resolve) => {
      const urlCode = this.getUrlCode(url);

      $.ajax({
        dataType: 'json',
        url: `http:\/\/${config.api}?q=${urlCode}&u=${this.settings.uid}&client=chrome_extension&origin=site`,
      }).then((response) => {
        const facts = [];
        if (response.error) {
          return resolve(facts);
        }

        Object.keys(response.data).forEach((id) => {
          const fact = response.data[id];
          fact.id = id;
          facts.push(fact);
        });

        resolve(facts);
      });
    });
  }

  getAllFacts() {
    return new Promise((resolve, reject) => {
      $.ajax({
        dataType: 'json',
        url: `http:\/\/${config.api}?q=all&u=${this.settings.uid}&client=chrome_extension&origin=site`,
      }).then((response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          const facts = [];

          resolve(facts);
        }
      });
    });
  }

  getUrlCode(url) {
    const parser = document.createElement('a');
    parser.href = url;

    let purl = `${parser.host}${parser.pathname}`;
    purl = purl.replace(/^(www\.)/, '');

    if (purl[purl.length - 1] === '/') {
      purl = purl.substr(0, purl.length - 1);
    }

    return md5(purl);
  }
}

export default new FactualBackground();
