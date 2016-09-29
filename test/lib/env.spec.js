'use strict';

var chai = require('chai');
var expect = chai.expect;

var env = require('../../lib/env');

describe('env.applyArgs', function() {
  it('should set simple string key values', function() {
    var data = {};
    env.applyArgs(data, ['foo=bar', 'baz=qux']);
    expect(data).to.deep.eq({foo: 'bar', baz: 'qux'});
  });

  it('should set nested keys via dot notation', function() {
    var data = {};
    env.applyArgs(data, ['foo.bar=baz']);
    expect(data).to.deep.eq({foo: {bar: 'baz'}});
  });

  it('should parse valid json', function() {
    var data = {};
    env.applyArgs(data, ['foo={"bar":[1,2,3]}']);
    expect(data).to.deep.eq({foo: {bar: [1, 2, 3]}});

    data = {};
    env.applyArgs(data, ['foo=123']);
    expect(data).to.deep.eq({foo: 123});
  });

  it('should keep track of changed keys', function() {
    var data = {foo: 'bar'};
    expect(env.applyArgs(data, ['foo=baz', 'bar=qux'])).to.deep.eq(['foo']);
  });

  it('should throw if a reserved namespace is used', function() {
    expect(function() {
      env.applyArgs({}, ['firebase.something=else']);
    }).to.throw('reserved namespace');
  });

  it('should throw if a malformed arg is used', function() {
    expect(function() {
      env.applyArgs({}, ['foo=bar', 'baz']);
    }).to.throw('must be in key=val format');
  });
});

describe('env.nextVersion', function() {
  it('should throw on non-matching version', function() {
    expect(function() {
      env.nextVersion('not a version');
    }).to.throw('Invalid environment version');
  });

  it('should increment the version', function() {
    expect(env.nextVersion('v0')).to.eq('v1');
    expect(env.nextVersion('v999')).to.eq('v1000');
  });
});
