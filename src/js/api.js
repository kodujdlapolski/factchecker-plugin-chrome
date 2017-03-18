import Rx from 'rx';
import config from './config';
import { encodeParams, hashUrl } from './util';

// converting json api object to simple json object
const convertStatement = (jao) => {
  // assert jao['type'] = 'statements'
  const ret = jao.attributes;

  ret['id'] = jao.id;
  if (jao['links']['self']) {
    ret['api_uri'] = jao['links']['self'];
  }

  return ret;
}

export const getFacts = (url, uid, client, origin) => {
  return new Promise((resolve) => {
    const urlHash = hashUrl(url);
    const params = {
      uri: url, // todo hash
      client
    };

    if (origin) {
      params['origin'] = origin;
    }

    const apiurl = `${config.api}/statements?${encodeParams(params)}`;
    console.info('[factchecker-plugin-chrome] Querying for facts.', apiurl);

    $.ajax({
      dataType: 'json',
      url: apiurl,
    }).then((response) => { // todo fail catching function( jqXHR, textStatus, errorThrown ) {
      const facts = [];
      if (response.error) {
        return resolve(facts);
      }

      if (response.data) {
        Object.keys(response.data).forEach(id => facts.push(convertStatement(response.data[id])));
      }

      resolve(facts);
    });
  });
};

const getAllPage = (page, uid, client, origin) => {
  const params = {
    page,
    q: 'all',
    u: uid,
    client,
    origin,
  };

  return Rx.Observable.fromPromise(new Promise((resolve) => {
    const url = `${config.api}?${encodeParams(params)}`;
    console.info('[factchecker-plugin-chrome] Caching facts.', url);

    $.ajax({
      dataType: 'json',
      url: url,
    }).then((response) => {
      const result = {
        total_pages: 0,
        current_page: 0,
        data: [],
      };

      if (response.error) {
        return resolve(result);
      }

      result.total_pages = response.total_pages;
      result.current_page = response.current_page;

      if (response.data) {
        result.data = convertFacts(response.data);
      }

      return resolve(result);
    });
  }));
};

const getPagedItems = (index, uid, client, origin) => {
  return getAllPage(index, uid, client, origin)
    .flatMap((response) => {
      const result = Rx.Observable.return(response.data);

      if (response.total_pages > response.current_page) {
        const nextPage = response.current_page + 1;
        return result.concat(getPagedItems(nextPage, uid, client, origin));
      }

      return result;
    });
};

export const getAllFacts = (uid, client, origin) => {
  return new Promise((resolve) => {
    const facts$ = getPagedItems(1, uid, client, origin);
    let facts = [];

    facts$
      .subscribe(
        (result) => {
          facts = facts.concat(result);
        },
        (error) => {
          console.log('error');
          console.log(error);
        },
        () => {
          resolve(facts);
        }
      );
  });
};

export const getAllSources = (uid, client) => {
  return new Promise((resolve) => {
    const params = {
      uid,
      client,
    };
    const url = `${config.api}/sources_list?${encodeParams(params)}`;

    console.info('[factchecker-plugin-chrome] Querying for sources.', url);

    $.ajax({
      dataType: 'json',
      url: url,
    }).then((response) => {
      const sources = [];
      if (response.error) {
        // TODO is error logged anyhow?
        return resolve(sources);
      }

      resolve(response.data.attributes.sources);
    });
  });
};
