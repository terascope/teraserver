'use strict';

const Promise = require('bluebird');
const _ = require('lodash');

describe('user store', () => {
    const teranautConnectionType = 'default';
    const teraserverConnectionType = 'default';
    const sourceFields = [
        'client_id',
        'role',
        'firstname',
        'lastname',
        'username',
        'created',
        'updated',
        'id',
        'api_token',
        'email',
        'firstname.text',
        'lastname.text',
        'username.text',
        'email.text',
    ];

    let clientCount = 0;
    let indexData = [];
    let searchResults = null;
    let searchQuery = null;
    let deleteQuery = null;


    beforeEach(() => {
        indexData = [];
        clientCount = 0;
        searchQuery = null;
        deleteQuery = null;
    });

    const logger = {
        error() {},
        info() {},
        warn() {},
        trace() {},
        debug() {},
        flush() {}
    };

    function makeSearchResults() {
        const data = searchResults;
        if (!data._source) {
            return [{ _id: data.id, _type: data.type, _source: data.body }];
        }
        return [data];
    }

    function getData() {
        return {
            _shards: {
                failed: 0,
                failures: []
            },
            hits: {
                total: clientCount,
                hits: searchResults ? makeSearchResults() : []
            }
        };
    }
    const createResults = { acknowledged: true, shards_acknowledged: true };
    const refreshResults = { _shards: { total: 10, successful: 5, failed: 0 } };

    const foundation = {
        makeLogger: () => logger,
        getConnection: () => ({
            client: {
                search: (query) => {
                    searchQuery = query;
                    return Promise.resolve(getData());
                },
                index: (data) => {
                    indexData.push(data);
                    return Promise.resolve(true);
                },
                delete: (query) => {
                    deleteQuery = query;
                    return Promise.resolve({ found: true });
                },
                update: () => Promise.resolve(true),
                indices: {
                    exists: () => Promise.resolve(false),
                    create: () => Promise.resolve(createResults),
                    refresh: () => Promise.resolve(refreshResults),
                    putTemplate: () => Promise.resolve({ acknowledged: true }),
                }
            }
        }),
    };

    const context = {
        foundation,
        apis: {
            registerAPI: () => {},
            foundation
        },
        sysconfig: {
            teranaut: {
                connection: teranautConnectionType
            },
            teraserver: {
                stats: {
                    service: 'api',
                    es_connection: 'default'
                },
                name: 'test',
                connection: teraserverConnectionType
            },
            _nodeName: 'this.is.mylaptop.1'
        }
    };

    function createClient() {
        return Promise.resolve()
            .then(() => require('../plugins/teranaut/server/store/users')(context));
    }

    function expectFailure(fn, data) {
        return Promise.resolve()
            .then(() => fn(data))
            .then(results => Promise.reject(results))
            .catch(err => Promise.resolve(err));
    }

    function makeUser(user) {
        return _.extend({
            client_id: 1234,
            username: 'someusername',
            hash: 'somepassword'
        }, user);
    }


    // const userStore = require('../plugins/teranaut/server/store/users')(context);

    it('can instantiate', (done) => {
        Promise.resolve()
            .then(() => createClient())
            .then((api) => {
                expect(typeof api).toEqual('object');
                expect(api.createUser).toBeDefined();
                expect(typeof api.createUser).toEqual('function');

                expect(api.updateUser).toBeDefined();
                expect(typeof api.updateUser).toEqual('function');

                expect(api.updateToken).toBeDefined();
                expect(typeof api.updateToken).toEqual('function');

                expect(api.findByToken).toBeDefined();
                expect(typeof api.findByToken).toEqual('function');

                expect(api.findByUsername).toBeDefined();
                expect(typeof api.findByUsername).toEqual('function');

                expect(api.deleteUser).toBeDefined();
                expect(typeof api.deleteUser).toEqual('function');

                expect(api.authenticateUser).toBeDefined();
                expect(typeof api.authenticateUser).toEqual('function');

                expect(api.createApiTokenHash).toBeDefined();
                expect(typeof api.createApiTokenHash).toEqual('function');

                expect(api.serializeUser).toBeDefined();
                expect(typeof api.serializeUser).toEqual('function');

                expect(api.deserializeUser).toBeDefined();
                expect(typeof api.deserializeUser).toEqual('function');

                expect(api.searchSettings).toBeDefined();
                expect(typeof api.searchSettings).toEqual('function');
            })
            .catch(fail)
            .finally(done);
    });

    it('searchSettings can return search configurations', (done) => {
        Promise.resolve()
            .then(() => createClient())
            .then(api => api.searchSettings())
            .then((searchConfig) => {
                expect(searchConfig.client).toBeDefined();
                expect(typeof searchConfig.client).toEqual('object');

                expect(searchConfig.index).toBeDefined();
                expect(searchConfig.index).toEqual('test__users');

                expect(searchConfig.fields).toBeDefined();
                expect(Array.isArray(searchConfig.fields)).toEqual(true);
                expect(searchConfig.fields).toEqual(sourceFields);
            })
            .catch(fail)
            .finally(done);
    });

    it('can create a api token hash', (done) => {
        const newUser = makeUser();

        Promise.resolve()
            .then(() => createClient())
            .then((api) => {
                expect(newUser.api_token).toEqual(undefined);
                return api.createApiTokenHash(newUser);
            })
            .then((hashedTokenUser) => {
                expect(hashedTokenUser.api_token).toBeDefined();
                expect(typeof hashedTokenUser.api_token).toEqual('string');
            })
            .catch(fail)
            .finally(done);
    });

    it('can create a user', (done) => {
        const user = makeUser();
        const dateTime = new Date().getTime();

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(user))
            .then((results) => {
                const userDoc = indexData.pop();
                const { body } = userDoc;
                expect(userDoc).toBeDefined();
                expect(userDoc.index).toEqual('test__users');
                expect(userDoc.type).toEqual('user');
                expect(userDoc.id === body.id).toEqual(true);
                expect(userDoc.id === results.id).toEqual(true);

                expect(body.client_id).toEqual(1234);
                expect(body.username).toEqual('someusername');
                expect(body.hash).toBeDefined();
                expect(typeof body.hash).toEqual('string');
                expect(body.role).toEqual('user');

                expect(body.created).toBeDefined();
                expect(typeof body.created).toEqual('string');
                expect(new Date(body.created).getTime() >= dateTime).toEqual(true);
                expect(body.updated).toBeDefined();
                expect(typeof body.updated).toEqual('string');
                expect(new Date(body.updated).getTime() >= dateTime).toEqual(true);
                expect(body.updated === body.created).toEqual(true);

                expect(body.salt).toBeDefined();
                expect(typeof body.salt).toEqual('string');

                expect(body.api_token).toBeDefined();
                expect(typeof body.api_token).toEqual('string');

                expect(results.id).toBeDefined();
                expect(typeof results.id).toEqual('string');
                expect(results.id.length).toEqual(10);

                expect(results.token).toBeDefined();
                expect(typeof results.token).toEqual('string');
                expect(results.token.length).toEqual(40);

                expect(results.date).toBeDefined();
                expect(typeof results.date).toEqual('string');
                expect(new Date(results.date).getTime() >= dateTime).toEqual(true);
            })
            .catch(fail)
            .finally(done);
    });

    it('will validate user being passed in and ensure unique usernames', (done) => {
        const badUser1 = makeUser({ hash: null });
        const badUser2 = makeUser({ client_id: null });
        const badUser3 = makeUser({ firstname: 12342 });
        const badUser4 = makeUser({ lastname: { some: 'data ' } });
        const badUser5 = makeUser({ email: 12341234 });
        const badUser6 = makeUser({ api_token: { something: 'else' } });
        const badUser7 = makeUser({ role: 'IWILLPAWNZYOU!@' });
        const badUser8 = makeUser({ created: {} });

        const okUser1 = makeUser({ email: '   CAPITALCASE@GMAIL.COM   ' });
        const okUser2 = makeUser({ role: '  admin  ' });
        const okUser3 = makeUser({ role: 'analyst' });
        const okUser4 = makeUser({ role: 'domains-user' });
        const okUser5 = makeUser({ role: 'class-b-user' });
        const okUser6 = makeUser({ anotherkey: 'anotherValue' });

        const userAlreadyExists = makeUser({ client: 'count' });

        let api;

        Promise.resolve()
            .then(() => createClient())
            .then((_api) => {
                api = _api;
            })
            .then(() => Promise.all([
                expectFailure(api.createUser, badUser1),
                expectFailure(api.createUser, badUser2),
                expectFailure(api.createUser, badUser3),
                expectFailure(api.createUser, badUser4),
                expectFailure(api.createUser, badUser5),
                expectFailure(api.createUser, badUser6),
                expectFailure(api.createUser, badUser7),
                expectFailure(api.createUser, badUser8)
            ]))
            .then(() => Promise.all([
                api.createUser(okUser1),
                api.createUser(okUser2),
                api.createUser(okUser3),
                api.createUser(okUser4),
                api.createUser(okUser5),
                api.createUser(okUser6)
            ]))
            .then(() => {
                const user1Results = indexData.find(user => user.body.email === 'capitalcase@gmail.com');
                const user2Results = indexData.find(user => user.body.role === 'admin');
                const user6Results = indexData.find(user => user.body.anotherkey === 'anotherValue');
                expect(user1Results.body.email).toEqual('capitalcase@gmail.com');
                expect(user2Results.body.role).toEqual('admin');
                expect(user6Results.body.anotherkey).toEqual('anotherValue');

                // simulate username that already exists
                clientCount = 1;
                return api.createUser(userAlreadyExists)
                    .then(fail)
                    .catch(err => expect(err).toEqual('username is not unique'));
            })
            .catch(fail)
            .finally(done);
    });

    it('can find by username and can sanitize results', (done) => {
        const okUser1 = makeUser({ email: '   CAPITALCASE@GMAIL.COM   ' });
        let user = null;
        const endingQuery = {
            index: 'test__users',
            type: 'user',
            q: 'username:someusername',
            _source: sourceFields
        };

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(okUser1)
                .then(() => {
                    user = indexData.pop();
                    searchResults = user;
                    return api.findByUsername(user.body.username);
                })
                .then((foundUser) => {
                    expect(foundUser).toEqual(user.body);
                    return api.findByUsername(user.body.username, true);
                })
                .then(() => expect(searchQuery).toEqual(endingQuery)))
            .catch(fail)
            .finally(done);
    });

    it('can update a user and update salt and hash on password change', (done) => {
        const okUser1 = makeUser({ email: '   CAPITALCASE@GMAIL.COM   ' });
        let user = null;

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(okUser1)
                .then(() => {
                    user = indexData.pop();
                    searchResults = user;
                    const updatedUser = _.cloneDeep(user);
                    // to show that it re-validates
                    updatedUser.body.email = '   CAPITALCASE@GMAIL.COM   ';
                    updatedUser.body.hash = 'Password1234';
                    return api.updateUser(updatedUser.body);
                })
                .then((updatedUser) => {
                    expect(updatedUser.email).toEqual('capitalcase@gmail.com');
                    expect(updatedUser.salt !== user.body.salt).toEqual(true);
                    expect(updatedUser.hash !== user.body.hash).toEqual(true);
                    expect(updatedUser.api_token === user.body.api_token).toEqual(true);
                }))
            .catch(fail)
            .finally(done);
    });


    it('updateToken will create a new api_token', (done) => {
        const newUser = makeUser();
        let user;

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(newUser)
                .then(() => {
                    user = indexData.pop();
                    searchResults = user;
                    const updatedUser = _.cloneDeep(user);
                    return api.updateToken(updatedUser.body);
                }))
            .then((updatedUser) => {
                // no password or salt changes, just api_token
                expect(updatedUser.salt === user.body.salt).toEqual(true);
                expect(updatedUser.hash === user.body.hash).toEqual(true);
                expect(updatedUser.api_token !== user.body.api_token).toEqual(true);
            })
            .catch(fail)
            .finally(done);
    });

    it('can find user by Token', (done) => {
        const newUser = makeUser();
        let user = null;
        let token = null;

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(newUser)
                .then(() => {
                    user = indexData.pop();
                    searchResults = user;
                    token = user.body.api_token;
                    return api.findByToken(user.body.api_token);
                })
                .then(() => {
                    const endingQuery = {
                        index: 'test__users',
                        type: 'user',
                        q: `api_token:${token}`
                    };
                    expect(searchQuery).toEqual(endingQuery);
                }))
            .catch(fail)
            .finally(done);
    });

    it('can delete user', (done) => {
        const user = { id: 'someID' };

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.deleteUser(user))
            .then((bool) => {
                expect(bool).toEqual(true);
                expect(deleteQuery).toEqual({
                    index: 'test__users', type: 'user', id: 'someID', refresh: true
                });
            })
            .catch(fail)
            .finally(done);
    });

    it('can authenticate users', (done) => {
        const newUser = makeUser();
        let user = null;

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(newUser)
                .then(() => {
                    user = indexData.pop();
                    // act like no user was found
                    searchResults = [];
                    return api.authenticateUser('wrongUserName', 'somepassword');
                })
                .then((notFoundUser) => {
                    expect(notFoundUser).toEqual(false);
                    // search should now find user
                    searchResults = user;
                    return api.authenticateUser('someusername', 'someOtherpassword');
                })
                .then((foundUserBytWrongHash) => {
                    expect(foundUserBytWrongHash).toEqual(null);
                    return api.authenticateUser('someusername', 'somepassword');
                })
                .then((foundUser) => {
                    expect(foundUser.id === user.body.id);
                    expect(foundUser.salt === user.body.salt);
                    expect(foundUser.hash === user.body.hash);
                }))
            .catch(fail)
            .finally(done);
    });

    it('has a serializeUser method for passport', (done) => {
        const newUser = makeUser();

        function expressStyleCallback(firstArg, secondArg) {
            // expect that there is no error
            expect(firstArg).toEqual(null);
            expect(secondArg).toEqual(newUser.username);
        }

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.serializeUser(newUser, expressStyleCallback))
            .catch(fail)
            .finally(done);
    });

    it('has a deserializeUser method for passport', (done) => {
        const newUser = makeUser();
        let user = null;
        const endingQuery = {
            index: 'test__users',
            type: 'user',
            q: 'username:someusername',
        };

        function expressStyleCallback(firstArg, secondArg) {
            // expect that there is no error
            expect(firstArg).toEqual(null);
            expect(secondArg).toEqual(user.body);
            expect(searchQuery).toEqual(endingQuery);
        }

        Promise.resolve()
            .then(() => createClient())
            .then(api => api.createUser(newUser)
                .then(() => {
                    user = indexData.pop();
                    searchResults = user;
                    return api.deserializeUser(user.body.username, expressStyleCallback);
                }))
            .catch(fail)
            .finally(done);
    });
});
