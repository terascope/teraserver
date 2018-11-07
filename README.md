# teraserver

Node.js server to run Teranaut based applications

## Setup

* Install node dependencies:

```
yarn  # or npm install or whatever
```

* Globally install `bunyan`

```
npm install -g bunyan
```

* Launch Elasticsearch container:

```
docker pull elasticsearch
docker run -d -p 9200:9200 --name teraserver-es elasticsearch
```

* Launch Mongodb container:

```
docker pull mongo
docker run -d -p 27017:27017 --name teraserver-mongo mongo
```

* Launch Redis container:

```
docker pull redis
docker run -d -p 6379:6379 --name teraserver-redis redis
```

* Tweak the `config.json` as necessary to match your environment.
  Elasticsearch, MongoDB

* Run the `create_admin.js` script:

```
node scripts/create_admin.js
```

* Now you can run the service:

```
npm start | bunyan
```

If you don't see any errors, you should be able to hit the API with `curl`:

```
curl http://localhost:8000/api/v1
{"error":"Access Denied"}
```

Now you can add another user through the Teraserver HTTP API using the
`createUser.js` command:

```
node scripts/createUser.js -a 3331fbf5f129ce8974656e326a917fb90f5b87a6 -u godber -p awesome -f Austin -l Godber
```

## Search Api Usage
The search api can be setup inside of a teraserver plugin. Its attached to config.search;
```
var app, client, logger;

var api = {
    _config: undefined,

    config: function(config) {
        this._config = config;
        logger = config.logger;
        app = config.app;
        client = config.elasticsearch;
    },

    static: () => {},
    init: () => {},
    pre: () => {},

    routes: function() {
        var config = this._config;
        var search = config.search(config, '@timestamp');
      
        app.use('/api/v1/some-endpoint', function(req, res) {
            var queryConfig = {
                es_client: config.elasticsearch,
                sort_enabled: true,
                sort_default: false,
                sort_dates_only: false,
                date_range: true,
                geo_field: 'location'
            };
        
            search.luceneQuery(req, res, 'test-recovery-300', queryConfig);
        });
    },

    post: () => {}
};

```

The search module takes in two arguments, the first is the application configuration object and the second is optional and is the name of the field that you we be searching dates off of from your records.

It will return three apis in which you can use once you add endpoint configuration

### endpoint configuration

| Configuration | Description | Type |  Notes
|:---------: | :--------: | :------: | :------:
require_query | set to true if every request must have a lucene query at query param "q"   | Boolean | optional, only used for luceneQuery or luceneWithHistoryQuery endpoints
allowed_fields | if you wish to restrict which fields are available for search then you can set an array of strings of the field names that are allowed. Any other field not listed will be restricted | String[] | optional
max_query_size | Set to restrict the max amount documents returned in a given request. A request cannot bypass this number | Number | opitonal, defaults to 100000
date_range | set to true if you want to allow date based queries against the date field specied on module instantiation | Boolean | optional, needs to be set for any date based queries 
sort_dates_only | Set to true if you want to enforce that the only sortable field is the date field name specified as the second argument to module instantiation | Boolean | optional (ie  var search = config.search(config, '@timestamp');  => sort is restricted to the '@timestamp' field)
sort_default | you may specify a default sort to all queries, this will work even in sort_enabled is not set. This will be overridden if sorts are allowed | String | optional 
sort_enabled | set to true to allow any sorting by user, this respects the sort_dates_only flag | Boolean | optional 
geo_field | if set it is the name of the field that will be used to search against for geo based queries | String | optional 
preserve_index_name | if set to true, then it will mutate the returning data records to specify what index the record came from. It is set to the "_index" field on the record | Boolean | optional 
history_prefix | can specify a prefix that will be used for all index searches for the query, only used in luceneWithHistoryQuery api queries if set | String | optional (ie history_prefix: "logscope-" dateStr => logscope-2016.11.11*)
pre_process | if set this will call the function provided on the query and endpoint config before a search is made. This function must return the new query to be used | Function | optional
post_process | if set this will call the function provided on the returning results data set. It takes in an array of objects and must return an array of objects | Function | optional


### luceneQuery
This api is used to do general lucene based queries for this endpoint

```
var search = config.search(config, '@timestamp');

app.use('/api/v1/logstash', function(req, res) {
    var endpointConfig = {
        es_client: config.elasticsearch,
        sort_enabled: true,
        sort_default: false,
        sort_dates_only: false,
        date_range: true,
        geo_field: 'location'
    };

    search.luceneQuery(req, res, 'test-recovery-300', endpointConfig);
});
```

it takes in the request and response streams, the name of the index for which it will search and the endpoint configuration



### luceneWithHistoryQuery
This api is nearly the same as luceneQuery but it can restrict the query to just a subset of indices. History is taken as "days back from current" or if history_start is  provided "days back from history_start.

```
var search = config.search(config, '@timestamp');

app.use('/api/v1/logstash', function(req, res) {
    var endpointConfig = {
        es_client: config.elasticsearch,
        sort_enabled: true,
        sort_default: false,
        sort_dates_only: false,
        date_range: true,
        geo_field: 'location',
        history_prefix: 'logscope-'
    };

    search.luceneWithHistoryQuery(req, res, 'test-recovery-300', endpointConfig);
});
```

### performSearch
This is used to do raw searches on the elasticsearch client. This is used by the other two endpoints. NOTE generally this should not be used unless you are going to mimic the behaviours of the other two apis and set the appropriate query parameters in endpointConfig

```
var search = config.search(config, '@timestamp');
var context = config.context;

app.use('/api/v1/logstash', function(req, res) {
    var endpointConfig = {
        es_client: config.elasticsearch,
        sort_enabled: true,
        sort_default: false,
        sort_dates_only: false,
        date_range: true,
        geo_field: 'location',
        history_prefix: 'logscope-'
    };

    search.performSearch(context, req, res, endpointConfig);
});

```

### List of request query parameters available

Query Parmeters:
- size
- date_start
- date_end
- start
- type
- sort
- fields
- pretty (only set to format response, only should be used for viewing)
- history
- q (lucene query goes here)

#### post_process
You can set post_process on the api endpoint to manipulte the data before it is sent in the response.

```
// it takes an array of objects, and it must return an array of objects
function postProcessFn(dataArray) {
    return dataArray.map((data) => {
        data._metaData = 'something';
        return data;
    })
}

var queryConfig = {
                es_client: config.elasticsearch,
                sort_enabled: true,
                sort_default: false,
                sort_dates_only: false,
                date_range: true,
                geo_field: 'location',
                post_process: postProcessFn
            };

search.luceneQuery(req, res, 'test-recovery-300', queryConfig);

// response 

{
    info: '1 results found.',
    total: 1,
    returning: 1,
    results: [{ some: data, _metaData: 'something' }]
}         

```

#### pre_process
You can set pre_process on the api endpoint to manipulte the query and configuration before it is searched.

```
// reqQuery represents the http request query object (req.query, fields listed above)
// reqConfig represents queryConfig listed below
function addDates(reqQuery, reqConfig) {
   reqQuery.start = 100;
  if (reqConfig.date_range) {
      reqQuery.date_start = someNewDate;
      reqQuery.date_end = someOtherNewDate;
  }
  return reqQuery;
}

var queryConfig = {
                es_client: config.elasticsearch,
                sort_enabled: true,
                sort_default: false,
                sort_dates_only: false,
                date_range: true,
                geo_field: 'location',
                pre_process: addDates
            };

search.luceneQuery(req, res, 'test-recovery-300', queryConfig);

// final query generated for elasticsearch 
{
  body: {
      query: {
          bool: {
              must: [{
                  range: {
                      created: {
                          gte: someNewDate,
                          lte: someOtherNewDate
                      }
                  }
              }]
          }
      }
  },
  size: 100,
  from: 100
}        

```
