'use strict';

var chai = require('chai');
var expect = chai.expect;

var path = require('path');
var loadRCFiles = require('../../lib/loadRCFiles');

var fixturesDir = path.resolve(__dirname, '../fixtures');

describe('loadRCFiles', function() {
  it('should merge all detected files', function() {
    var result = loadRCFiles(path.resolve(fixturesDir, 'fbrc/conflict'));
    expect(result.project.default).to.eq('conflict');
    return expect(result.project.other).to.eq('top');
  });

  it('should not crash when encountering malformed files', function() {
    var result = loadRCFiles(path.resolve(fixturesDir, 'fbrc/invalid'));
    return expect(result.length).to.be.object;
  });
});
