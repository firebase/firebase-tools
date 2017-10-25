#!/usr/bin/env node
'use strict';

var chalk = require('chalk');
var exec = require('child_process').exec;
var expect = require('chai').expect;
var fs = require('fs-extra');
var tmp = require('tmp');
var RSVP = require('rsvp');

var api = require('../lib/api');
var scopes = require('../lib/scopes');
var configstore = require('../lib/configstore');

var localFirebase = __dirname + '/../bin/firebase';
var projectDir = __dirname + '/test-project';
var tmpDir;

var preTest = function() {
  var dir = tmp.dirSync({prefix: 'cfgtest_'});
  tmpDir = dir.name;
  fs.copySync(projectDir, tmpDir);
  api.setRefreshToken(configstore.get('tokens').refresh_token);
  api.setScopes(scopes.CLOUD_PLATFORM);
  console.log('Done pretest prep.');
};

var postTest = function() {
  fs.remove(tmpDir);
  console.log('Done post-test cleanup.');
};

var set = function(expression) {
  return new RSVP.Promise(function(resolve) {
    exec(localFirebase + ' functions:config:set ' + expression, {'cwd': tmpDir}, function(err) {
      expect(err).to.be.null;
      resolve();
    });
  });
};

var unset = function(key) {
  return new RSVP.Promise(function(resolve) {
    exec(localFirebase + ' functions:config:unset ' + key, {'cwd': tmpDir}, function(err) {
      expect(err).to.be.null;
      resolve();
    });
  });
};

var getAndCompare = function(expected) {
  return new RSVP.Promise(function(resolve) {
    exec(localFirebase + ' functions:config:get', {'cwd': tmpDir}, function(err, stdout) {
      expect(JSON.parse(stdout)).to.deep.equal(expected);
      resolve();
    });
  });
};

var runTest = function(description, expression, key, expected) {
  return set(expression)
  .then(function() {
    return getAndCompare(expected);
  }).then(function() {
    return unset(key);
  }).then(function() {
    console.log(chalk.green('\u2713 Test passed: ') + description);
  });
};

var main = function() {
  preTest();
  runTest('string value', 'foo.bar=faz', 'foo', {foo: {bar: 'faz'}})
  .then(function() {
    return runTest('string value in quotes', 'foo.bar="faz"', 'foo', {foo: {bar: 'faz'}});
  }).then(function() {
    return runTest('string value with quotes', 'foo.bar=\'"faz"\'', 'foo', {foo: {bar: '\"faz\"'}});
  }).then(function() {
    return runTest('single-part key and JSON value', 'foo=\'{"bar":"faz"}\'', 'foo', {foo: {bar: 'faz'}});
  }).then(function() {
    return runTest('multi-part key and JSON value', 'foo.too=\'{"bar":"faz"}\'', 'foo', {foo: {too: {bar: 'faz'}}});
  }).then(function() {
    return runTest('numeric value', 'foo.bar=123', 'foo', {foo: {bar: '123'}});
  }).then(function() {
    return runTest('numeric value in quotes', 'foo.bar="123"', 'foo', {foo: {bar: '123'}});
  }).then(function() {
    return runTest('null value', 'foo.bar=null', 'foo',  {foo: {bar: 'null'}});
  }).catch(function(err) {
    console.log(chalk.red('Error while running tests: '), err);
    return RSVP.resolve();
  }).then(postTest);
};

main();
