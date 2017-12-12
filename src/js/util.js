import qs from 'qs';
import sha256 from 'crypto-js/sha256';
import diacriticsMap from './diacritics';

const originParam = 'factcheck-user-came-from'

export const removeDiacritics = (str) => {
  return str.replace(/[^\u0000-\u007E]/g, (a) => {
    return diacriticsMap[a] || a;
  });
};

export const cleanupQuote = (quote) => {
  let cleanedQuote = removeDiacritics(quote);

  if (cleanedQuote[0] === '"' || cleanedQuote[0] === '„') {
    cleanedQuote = cleanedQuote.substr(1);
  }

  if (cleanedQuote[cleanedQuote.length - 1] === '"' || cleanedQuote[cleanedQuote.length - 1] === '„') {
    cleanedQuote = cleanedQuote.slice(0, -1);
  }

  if (cleanedQuote[cleanedQuote.length - 1] === '\\') {
    cleanedQuote = cleanedQuote.slice(0, -1);
  }

  return cleanedQuote;
};

export const getURL = (file) => {
  return chrome.extension.getURL(file);
};

export const getDate = (timestamp) => {
  const date = new Date(timestamp * 1000);

  return `${date.getDate() < 10 ? '0' : ''}${date.getDate()}.${date.getMonth() < 9 ? '0' : ''}${date.getMonth() + 1}.${date.getFullYear()}`;
};

export const getUserToken = () => {
  const pool = new Uint8Array(32);
  crypto.getRandomValues(pool);

  let uid = '';
  for (let i = 0; i < pool.length; ++i) {
    uid += pool[i].toString(16);
  }

  return uid;
};

export const isFacebook = () => {
  return window.location.href.indexOf('https://www.facebook.com/') === 0;
};

export const extractLink = (url) => {
  const fbUrls = [
    'www.facebook.com/l.php?u=',
    'l.facebook.com/l.php?u=',
  ];

  let found = false;
  fbUrls.forEach((u) => {
    if (url.indexOf(`http://${u}`) === 0 || url.indexOf(`https://${u}`) === 0) {
      found = true;
    }
  });

  if (!found) {
    return url;
  }

  const parsed = qs.parse(url.split('?')[1]);

  return parsed.u;
};

export const encodeParams = (params) => {
  return qs.stringify(params);
};

export const parseUrl = (url) => {
  const parser = document.createElement('a');
  parser.href = url;

  parser.searchparams = qs.parse(parser.search);
  return parser;
}

export const parseFCOrigin = (url) => {
  const parser = document.createElement('a');
  parser.href = url;

  const params = qs.parse(parser.search);

  return params[originParam];
}

function getJsonFromUrl() {
  var query = location.search.substr(1);
  var result = {};
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

// rules allow to define URL standardization for given domains or paths
// mostly it's used to strip unneccesary query fields
export const standardizeUrl = (fullurl, rules) => {
  const url = document.createElement('a');
  url.href = fullurl;

  /* rules example
  var rules = [{
    'if': ['youtube.com/watch', 'www.youtube.com/watch'],
    'then': {
      'save_query_fields': ['v']
     }
  }];
  */

  // choose rules
  var actions = {};
  rules.forEach(r => {
    if (!Array.isArray(r.if)) r.if = [r.if];

    if(r.if.some(domainOrPath => {
      const condition = document.createElement('a');
      condition.href = 'http://' + domainOrPath;

      // condition can specify path for exact match, ie. youtube.com/watch
      return (url.host == condition.host) &&
        !(condition.pathname != '/' && url.pathname != condition.pathname);
    })) {
      for (const action in r.then) {
        if (action in actions && Array.isArray(actions[action])) {
          // aggregate array values
          actions[action] = actions[action].concat(r.then[action]);

        } else {
          actions[action] = r.then[action];
        }
      }
    };
  });

  // strip final slash
  if (url.pathname[url.pathname.length - 1] === '/') {
    url.pathname = url.pathname.substr(0, url.pathname.length - 1);
  }

  // strip www subdomain unless explicitly said not to do it
  if (!actions['save_www']) {
    url.host = url.host.replace(/^www\./, '');
  }

  var standardized = url.host + url.pathname;

  if (actions['save_query_fields'] && url.search) {
    var saved = {};
    var foundAny = false;

    const fields = qs.parse(url.search.substr(1));
    actions['save_query_fields'].forEach(fld => {
      if (fields.hasOwnProperty(fld)) {
        saved[fld] = fields[fld];
        foundAny = true;
      }
    });

    if (foundAny)
      standardized += '?' + qs.stringify(saved);
  }

  if (actions['save_hash']) {
    standardized += url.hash;
  }

  return standardized;
};

export const hashUrl = (url) => {
  return sha256(url).toString();
};

export const getFacebookUrl = (article) => {
  const url = $('a[rel=nofollow]', article).prop('href');
  if (!url) {
    return null;
  }

  const aurl = extractLink(url);
  return aurl;
};
