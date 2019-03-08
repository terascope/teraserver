'use strict';

module.exports = {
    rootDir: '.',
    verbose: true,
    setupFilesAfterEnv: [
        'jest-extended'
    ],
    testMatch: [
        '<rootDir>/test/*-spec.js'
    ],
    collectCoverage: true,
    collectCoverageFrom: [
        '<rootDir>/lib/**/*.js',
        '<rootDir>/plugins/teranaut/*.js',
        '<rootDir>/plugins/teranaut/server/**/*.js',
        '!<rootDir>/plugins/teranaut/node_modules',
    ],
    coverageReporters: ['lcov', 'text', 'html'],
    coverageDirectory: '<rootDir>/coverage'
};
