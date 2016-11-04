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
