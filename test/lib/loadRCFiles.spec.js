'use strict';

var chai = require('chai');
var expect = chai.expect;

var path = require('path');
var loadRCFile = require('../../lib/loadRCFile');

var fixturesDir = path.resolve(__dirname, '../fixtures');

describe('loadRCFile', function() {
  it('should load from nearest project directory', function() {
    var result = loadRCFile(path.resolve(fixturesDir, 'fbrc/conflict'));
    expect(result.project.default).to.eq('top');
  });

  it('should be an empty object when not in project dir', function() {
    var result = loadRCFile(__dirname);
    return expect(result).to.deep.eq({});
  });

  it('should not throw up on invalid json', function() {
    var result = loadRCFile(path.resolve(fixturesDir, 'fbrc/invalid'));
    return expect(result).to.deep.eq({});
  });
});
