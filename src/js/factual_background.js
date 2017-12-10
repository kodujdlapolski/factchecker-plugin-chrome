/**
 * @file Factual Background
 * @name Factual
 *
 * Factual extension background code.
 *
 * @author Alexandru Badiu <andu@ctrlz.ro>
 */
import { getFacts, getAllFacts, getAllSources } from './api';
import { getUserToken, slugify, standardizeUrl as utilsStandardizeUrl, parseFCOrigin, parseUrl} from './util';
import config from './config';

require('../css/factual.scss');

class TabInfo {
  constructor(tabId) {
    this.tabId = tabId;
    this.numberOfFacts = 0;
    this.contentLoaded = false;
    this.currentUrl = null;
    this.previousUrl = null;

    this.updateBrowserAction();
  }

  setNumberOfFacts(value) {
    this.numberOfFacts = value;
    this.updateBrowserAction();
  }

  setLoading(url) {
    this.previousUrl = this.currentUrl;
    this.currentUrl = url;
  }

  getCurrentUrl() {
    return this.currentUrl;
  }

  getPreviousUrl() {
    return this.previousUrl;
  }

  isContentLoaded() {
    return this.contentLoaded;
  }

  setContentLoaded(contentLoaded = true) {
    this.contentLoaded = contentLoaded;
  }

  updateBrowserAction() {
    if (this.numberOfFacts) {
      chrome.browserAction.setIcon({
        path : {
          '19': 'assets/icon_19x19.png',
          '38': 'assets/icon_38x38.png',
        }
      });

      chrome.browserAction.setBadgeText({ text: `${this.numberOfFacts}` });

      return;
    }

    chrome.browserAction.setIcon({
      path : {
        '19': 'assets/icon_gray_19x19.png',
        '38': 'assets/icon_gray_38x38.png',
      }
    });

    chrome.browserAction.setBadgeText({ text: '' });
  }
}

class FactualBackground {
  constructor() {
    console.info('[factchecker-plugin-chrome] Background init.');

    this.cachedFacts = [];
    this.settings = {
      enabled: true,
      uid: '',
    };
    this.tabsInfo = {};

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

  getTabInfo(tabId) {
    if (this.tabsInfo[tabId]) {
      return this.tabsInfo[tabId];
    }

    const newInfo = new TabInfo(tabId);
    this.tabsInfo[tabId] = newInfo;
    return newInfo;
  }

  updateCachedFacts(facts) {
    this.cachedFacts = facts;
    chrome.storage.local.set({ facts: this.cachedFacts });
  }

  updateCachedSources(sources_arr) {
    // map array as object
    const sources_obj = {};
    // remember URLs served by API because they may be modified by standardization
    sources_arr.forEach(url => sources_obj[this.standardizeUrl(url)] = url);

    this.cachedSources = sources_obj;
    chrome.storage.local.set({ sources: this.cachedSources });
  }

  sourceCachingIsEnabled() {
    return !!config.updateSourcesCachePeriodInMinutes;
  }

  getCachedSource(url) {
    return this.cachedSources[this.standardizeUrl(url)];
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
      this.tabsInfo[sender.tab.id].setNumberOfFacts(request.numFacts);

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

      const cfacts = _.filter(this.cachedFacts, { source: this.standardizeUrl(request.url) });
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

  onUpdated(tabId, changeInfo, tabData) {
    var tabInfo = this.getTabInfo(tabId);
    console.log('info', 'onUpdated', tabId, changeInfo, tabData);

    if (changeInfo.status === 'loading' && changeInfo.url) {
      // save loaded URL
      tabInfo.setLoading(changeInfo.url);
      return;
    }

    if (changeInfo.status !== 'complete') {
      return;
    }

    if (tabInfo.isContentLoaded()) {
      // TODO to check: this might stop checking content on newly loaded Facebook posts
      // PS. this check is not neccessary
      console.log('Content already loaded');

      if (tabInfo.getCurrentUrl() !== tabInfo.getPreviousUrl()
        && tabInfo.getCurrentUrl() && tabInfo.getPreviousUrl()) {

        // URL changed, potential dynamic page reload, such as on YouTube
        console.debug(`URL changed from ${tabInfo.getPreviousUrl()} to ${tabInfo.getCurrentUrl()}. Dynamic page reload?`);

        var parsedCurrent = parseUrl(tabInfo.getCurrentUrl());
        var parsedPrevious = parseUrl(tabInfo.getPreviousUrl());
        parsedCurrent.hash = '';
        parsedPrevious.hash = '';

        if (parsedCurrent.href === parsedPrevious.href) {
          // only hash changed
        } else {
          chrome.tabs.sendMessage(tabId, {
            action: 'page-reloaded',
          });
        }
      }

      return;
    }

    tabInfo.setContentLoaded();

    chrome.tabs.sendMessage(tabId, {
      action: 'content-loaded',
    });
  }

  onActivated(activeInfo) {
    console.log('onActivated', activeInfo);
    this.getTabInfo(activeInfo.tabId).updateBrowserAction();
  }

  onRemoved(tabId) {
    console.log('onRemoved', tabId);
    delete this.tabsInfo[tabId];
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

  setupEvents() {
    chrome.storage.onChanged.addListener((changes, namespace) => this.settingsChanged(changes, namespace));
    chrome.browserAction.onClicked.addListener(() => this.toolbarClicked());
    chrome.tabs.onActivated.addListener((activeInfo) => this.onActivated(activeInfo));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tabData) => this.onUpdated(tabId, changeInfo, tabData));
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

  standardizeUrl(url) {
    // rules allow to define URL standardization for given domains or paths
    // mostly it's used to strip unneccesary query fields

    var rules = [{ // https://www.youtube.com/watch?v=fkMW9rBXn7o&amp;ab_channel=CEPERolkV4
      'if': ['youtube.com/watch', 'www.youtube.com/watch'],
      'then': {
        'save_query_fields': ['v', 't']
       }
    }, { // http://www.sejm.gov.pl/sejm8.nsf/transmisje.xsp?unid=C2AE0CE00D2C0A00C1257F940065355A#
    // http://www.sejm.gov.pl/Sejm7.nsf/komunikat.xsp?documentId=16C4F72CC6BB07F0C1257CC4002B708C
    // http://www.sejm.gov.pl/Sejm7.nsf/agent.xsp?symbol=glosowania&NrKadencji=7&NrPosiedzenia=66&NrGlosowania=43
      'if': ['sejm.gov.pl', 'www.sejm.gov.pl'],
      'then': {
        'save_query_fields': ['unid', 'documentId', 'symbol', 'NrKadencji', 'NrPosiedzenia', 'NrGlosowania']
      }
    }, { // http://wpolityce.pl/polityka/276980-minister-dziedziczak-to-niezrozumiale-ze-w-sprawie-statusu-polakow-w-niemczech-do-dzis-aktualne-sa-decyzje-z-czasow-iii-rzeszy-chcemy-partnerskich-relacji-nasz-wywiad?strona=3
      // TODO How to tackle multipages? https://github.com/kodujdlapolski/factchecker-plugin-chrome/issues/17
      'if': ['wpolityce.pl'],
      'then': {
        'save_query_fields': ['strona']
      }
    }, { // http://www.tokfm.pl/Tokfm/1,145400,18754260,likwidowac-gimnazja-wspolne-rozliczanie-sie-malzonkow-kto.html?as=2
      'if': ['tokfm.pl', 'www.tokfm.pl'],
      'then': {
        'save_query_fields': ['as']
      }
    }, { // http://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:12012M/TXT
      'if': ['eur-lex.europa.eu'],
      'then': {
        'save_query_fields': ['uri']
      }
    }];

    return utilsStandardizeUrl(url, rules);
  }
}

export default new FactualBackground();
