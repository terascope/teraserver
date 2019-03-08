'use strict';

const Promise = require('bluebird');
const routes = require('../plugins/teranaut/server/api/user');

describe('user routes', () => {
    let requireUserFn;
    const endpoints = {
        get: {},
        post: {},
        put: {},
        delete: {}
    };

    const router = {
        use(fn) { requireUserFn = fn; },
        get(route, fn) { endpoints.get[route] = { fn }; },
        post(route, fn) { endpoints.post[route] = { fn }; },
        put(route, fn) { endpoints.put[route] = { fn }; },
        delete(route, fn) { endpoints.delete[route] = { fn }; },
    };

    const store = {
        searchSettings() {
            return {
                client: () => {},
                fields: ['some', 'fields'],
                index: 'someIndex'
            };
        },
        findByUsername(username) {
            if (!username) return Promise.reject('no username');
            return Promise.resolve(username);
        },
        createUser(user) {
            if (!user) return Promise.reject('no user');
            return Promise.resolve(user);
        },
        updateUser(user) {
            if (!user) return Promise.reject('no user');
            return Promise.resolve(user);
        },
        deleteUser(user) {
            return Promise.resolve(user);
        }
    };

    const logger = {
        error() {},
        info() {},
        warn() {},
        trace() {},
        debug() {},
        flush() {}
    };

    const teraSearchApi = {
        luceneQuery(req, res, index, queryConfig) {
            return Promise.resolve({
                req, res, index, queryConfig
            });
        }
    };

    function makeApiCall(fn, req) {
        return new Promise((resolve, reject) => {
            const res = {
                status(number) {
                    return {
                        json(data) {
                            if (number >= 400) reject({ error: data.error, statusCode: number });
                            resolve({ data, statusCode: number });
                        },
                        send() { resolve({ data: {}, statusCode: number }); },

                    };
                },
                json(data) { resolve(data); }
            };

            fn(req, res);
        });
    }

    it('should be able to instantiate', () => {
        expect(() => { routes(router, store, logger, teraSearchApi); }).not.toThrow();
    });

    it('should assign routes', () => {
        routes(router, store, logger, teraSearchApi);
        expect(Object.keys(endpoints).length > 0).toEqual(true);
        expect(endpoints.get['/users']).toBeDefined();
        expect(typeof endpoints.get['/users'].fn).toEqual('function');

        expect(endpoints.get['/users/:username']).toBeDefined();
        expect(typeof endpoints.get['/users/:username'].fn).toEqual('function');

        expect(endpoints.delete['/users/:username']).toBeDefined();
        expect(typeof endpoints.delete['/users/:username'].fn).toEqual('function');

        expect(endpoints.post['/users']).toBeDefined();
        expect(typeof endpoints.post['/users'].fn).toEqual('function');

        expect(endpoints.put['/users/:username']).toBeDefined();
        expect(typeof endpoints.put['/users/:username'].fn).toEqual('function');
    });

    it('can require user at this endpoint', (done) => {
        routes(router, store, logger, teraSearchApi);
        const url = 'api/v1/users/someName';
        let statusNumber;

        const req1 = {
            url,
            user: { role: 'admin' },
        };

        // A user can update their own record. but they're not allowed to change their role.
        const req2 = {
            url,
            user: { username: 'someName' },
            params: {},
            body: { role: 'superuser', other: 'data' }
        };

        const req3 = {
            url,
            user: { username: 'otherName' },
            params: { id: 'otherName' },
            body: { role: 'willPawnYourServer', other: 'data' }
        };

        const req4 = {
            url,
            params: {},
            user: { username: 'otherName' },
        };

        const errResponse = { error: 'Access Denied - You don\'t have permission to this data' };


        function callRequireUser(req) {
            return new Promise((resolve, reject) => {
                // it resolves when next is called to simulate express callbacks
                function next() { resolve(true); }
                // simulate a access denied event
                const res = {
                    status(number) {
                        statusNumber = number;
                        return { json(err) { reject(err); } };
                    }
                };

                requireUserFn(req, res, next);
            });
        }

        Promise.resolve()
            .then(() => callRequireUser(req1))
            .then(() => callRequireUser(req2))
            .then(() => expect(req2.body.role).toEqual(undefined))
            .then(() => callRequireUser(req3))
            .then(() => expect(req3.body.role).toEqual(undefined))
            .then(() => callRequireUser(req4)
                .catch((err) => {
                    expect(err).toEqual(errResponse);
                    expect(statusNumber).toEqual(403);
                }))
            .catch(fail)
            .finally(done);
    });

    it('can get /users/:username', (done) => {
        routes(router, store, logger, teraSearchApi);
        const { fn: apiFn } = endpoints.get['/users/:username'];
        const req1 = { params: { username: 'username' } };
        const req2 = { params: {} };

        Promise.resolve()
            .then(() => makeApiCall(apiFn, req1))
            .then(() => makeApiCall(apiFn, req2)
                .catch((rejection) => {
                    expect(rejection.statusCode).toEqual(500);
                    expect(rejection.error).toEqual('could not find user with username undefined');
                }))
            .catch(fail)
            .finally(done);
    });

    it('can get /users/:username', (done) => {
        routes(router, store, logger, teraSearchApi);
        const { fn: apiFn } = endpoints.delete['/users/:username'];
        const req1 = { params: { username: 'username' } };
        const req2 = { params: {} };

        Promise.resolve()
            .then(() => makeApiCall(apiFn, req1))
            .then(results => expect(results.statusCode).toEqual(204))
            .then(() => makeApiCall(apiFn, req2)
                .catch((rejection) => {
                    expect(rejection.statusCode).toEqual(500);
                    expect(rejection.error).toEqual('could not delete user with username undefined');
                }))
            .catch(fail)
            .finally(done);
    });

    it('can post /users', (done) => {
        routes(router, store, logger, teraSearchApi);
        const { fn: apiFn } = endpoints.post['/users'];
        const req1 = { body: {} };
        const req2 = { params: {} };

        Promise.resolve()
            .then(() => makeApiCall(apiFn, req1))
            .then(results => expect(results.statusCode).toEqual(201))
            .then(() => makeApiCall(apiFn, req2)
                .catch((rejection) => {
                    expect(rejection.statusCode).toEqual(500);
                    expect(rejection.error).toEqual('error while creating user');
                }))
            .catch(fail)
            .finally(done);
    });

    it('can put /users/:username', (done) => {
        routes(router, store, logger, teraSearchApi);
        const { fn: apiFn } = endpoints.put['/users/:username'];
        const req1 = { body: {} };
        const req2 = { params: {} };

        Promise.resolve()
            .then(() => makeApiCall(apiFn, req1))
            .then(() => makeApiCall(apiFn, req2)
                .catch((rejection) => {
                    expect(rejection.statusCode).toEqual(500);
                    expect(rejection.error).toEqual('error while updating user');
                }))
            .catch(fail)
            .finally(done);
    });

    // search-spec.js tests the teraSearchApi itself
    it('can get /users', (done) => {
        const req1 = { body: {} };

        function makeTest() {
            return new Promise((resolve) => {
                const searchApi = {
                    luceneQuery(req, res, index, queryConfig) {
                        return resolve({
                            req, res, index, queryConfig
                        });
                    }
                };
                routes(router, store, logger, searchApi);
                const { fn: apiFn } = endpoints.get['/users'];


                apiFn(req1, {});
            });
        }

        Promise.resolve()
            .then(() => makeTest())
            .then((results) => {
                expect(results.req).toEqual(req1);
                expect(results.res).toEqual({});
                expect(results.index).toEqual('someIndex');
                expect(results.queryConfig.sort_enabled).toEqual(true);
                expect(results.queryConfig.sort_default).toEqual(false);
                expect(results.queryConfig.sort_dates_only).toEqual(false);
                expect(results.queryConfig.date_range).toEqual('created');
                expect(results.queryConfig.require_query).toEqual(false);
                expect(results.queryConfig.allowed_fields).toEqual(['some', 'fields']);
                expect(typeof results.queryConfig.es_client).toEqual('function');
            })
            .catch(fail)
            .finally(done);
    });
});
