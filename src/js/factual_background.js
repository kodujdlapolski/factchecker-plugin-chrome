/**
 * @file Factual Background
 * @name Factual
 *
 * Factual extension background code.
 *
 * @author Alexandru Badiu <andu@ctrlz.ro>
 */
import { getFacts, getAllFacts, getAllSources } from './api';
import { getUserToken, slugify, getShortUrl, parseFCOrigin} from './util';
import config from './config';

require('../css/factual.scss');

class FactualBackground {
  constructor() {

    console.info('[factchecker-plugin-chrome] Background init.');

    this.cachedFacts = [];
    this.settings = {
      enabled: true,
      uid: '',
    };
    this.tabIndicators = {};

    chrome.storage.sync.get('settings', (result) => {
      if (result && result.settings) {
        this.settings = result.settings;
      }

      if (!this.settings.uid) {
        this.settings.uid = getUserToken();
        this.settingsUpdate();
      }

      this.setupEvents();
      this.setupAlarms();
    });

    chrome.storage.local.get('facts', (data) => {
      this.cachedFacts = data.facts;
    });

    this.cachedSources = {};
    chrome.storage.local.get('sources', (data) => {
      this.cachedSources = data.sources;
    });
  }

  updateCachedFacts(facts) {
    this.cachedFacts = facts;
    chrome.storage.local.set({ facts: this.cachedFacts });
  }

  updateCachedSources(sources_arr) {
    // map array as object
    const sources_obj = {};
    // remember URLs served by API because they may be modified by standardization
    sources_arr.forEach(url => sources_obj[getShortUrl(url)] = url);

    this.cachedSources = sources_obj;
    chrome.storage.local.set({ sources: this.cachedSources });
  }

  sourceCachingIsEnabled() {
    return !!config.updateSourcesCachePeriodInMinutes;
  }

  getCachedSource(url) {
    return this.cachedSources[getShortUrl(url)];
  }

  toolbarClicked() {
    this.settings.enabled = !this.settings.enabled;

    this.settingsUpdate();
  }

  settingsChanged(changes) {
    if (!changes.settings) {
      return;
    }

    if (!_.isEqual(changes.settings.newValue, this.settings)) {
      this.settings = changes.settings.newValue;
      this.settingsPropagate();
    }
  }

  settingsUpdate() {
    chrome.storage.sync.set({
      settings: this.settings,
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
    if (request.action === 'action-update') {
      this.updateBrowserAction(sender.tab.id, request.numFacts);
      
      return false;
    }

    if (request.action === 'settings-get') {
      sendResponse(this.settings);
      return false;
    }

    if (request.action === 'facts-get') {
      const origin = parseFCOrigin(request.url);

      if (this.sourceCachingIsEnabled()) {
        const source = this.getCachedSource(request.url);
        if (!source) {
          return false; // no statements on this url
        }

        getFacts(source, this.settings.uid, 'chrome_extension', origin)
        .then((facts) => {
          sendResponse(facts);
        });

        return true; // will respond asynchronously
      }

      const cfacts = _.filter(this.cachedFacts, { source: getShortUrl(request.url) });
      if (cfacts.length) {
        sendResponse(cfacts);

        // We ping the API even if we had a cache hit for statistics purposes.
        getFacts(request.url, this.settings.uid, 'chrome_extension', origin);

        return false;
      }

      getFacts(request.url, this.settings.uid, 'chrome_extension', origin)
        .then((facts) => {
          sendResponse(facts);
        });

      return true; // will respond asynchronously
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

  onActivated(activeInfo) {
    if (this.tabIndicators[activeInfo.tabId]) {
      this.updateBrowserAction(activeInfo.tabId, this.tabIndicators[activeInfo.tabId]);

      return;
    }

    this.updateBrowserAction(activeInfo.tabId, 0);
  }

  onRemoved(tabId, removeInfo) {
    delete this.tabIndicators[tabId];
  }

  onAlarm(alarm) {
    if (alarm.name === config.pluginId + '-update-facts' && config.updateFullCachePeriodInMinutes) {
      getAllFacts(this.settings.uid, 'chrome_extension', 'site')
        .then((facts) => {
          this.updateCachedFacts(facts);
        });
    }

    if (alarm.name === config.pluginId + '-update-sources' && config.updateSourcesCachePeriodInMinutes) {
      getAllSources(this.settings.uid, 'chrome_extension', 'site')
        .then((sources) => {
          this.updateCachedSources(sources);
        });
    }
  }

  updateBrowserAction(tabId, numFacts) {
    if (numFacts) {
      chrome.browserAction.setIcon({
        path : {
          '19': 'assets/icon_19x19.png',
          '38': 'assets/icon_38x38.png',
        }
      });

      chrome.browserAction.setBadgeText({ text: `${numFacts}` });
      this.tabIndicators[tabId] = numFacts;
      return;
    }

    chrome.browserAction.setIcon({
      path : {
        '19': 'assets/icon_gray_19x19.png',
        '38': 'assets/icon_gray_38x38.png',
      }
    });

    chrome.browserAction.setBadgeText({ text: '' });
    delete this.tabIndicators[tabId];
  }

  setupEvents() {
    chrome.storage.onChanged.addListener((changes, namespace) => this.settingsChanged(changes, namespace));
    chrome.browserAction.onClicked.addListener(() => this.toolbarClicked());
    chrome.tabs.onActivated.addListener((activeInfo) => this.onActivated(activeInfo));
    chrome.tabs.onUpdated.addListener((tabId, info) => this.onUpdated(tabId, info));
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => this.onRemoved(tabId, removeInfo));
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => this.onMessage(request, sender, sendResponse));
    chrome.alarms.onAlarm.addListener(alarm => this.onAlarm(alarm));
  }

  setupAlarms() {
    chrome.alarms.getAll((alarms) => {
      if (!alarms.some(a => a.name === config.pluginId + '-update-facts') && config.updateFullCachePeriodInMinutes) {
        // TODO updating if period has changed between plugin releases
        chrome.alarms.create(config.pluginId + '-update-facts', {
          delayInMinutes: 1,
          periodInMinutes: config.updateFullCachePeriodInMinutes,
        });
      }

      if (!alarms.some(a => a.name === config.pluginId + '-update-sources') && config.updateSourcesCachePeriodInMinutes) {
        chrome.alarms.create(config.pluginId + '-update-sources', {
          delayInMinutes: 1,
          periodInMinutes: config.updateSourcesCachePeriodInMinutes,
        });
      }
    });
  }
}

export default new FactualBackground();
