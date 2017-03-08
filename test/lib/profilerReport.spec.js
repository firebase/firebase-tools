'use strict';

var chai = require('chai');
var expect = chai.expect;

var path = require('path');
var stream = require('stream');
var report = require('../../lib/profileReport');

var combinerFunc = function(obj1, obj2) {
  return {count: obj1.count + obj2.count};
};

var fixturesDir = path.resolve(__dirname, '../fixtures');

describe('profilerReport', function() {
  it('should correctly generate a report', function() {
    var input = path.resolve(fixturesDir, 'profiler-data/sample.json');
    var output = require(path.resolve(fixturesDir, 'profiler-data/sample-output.json'));
    var throwAwayStream = new stream.PassThrough();
    expect(report(input, throwAwayStream, {
      format: 'JSON',
      isFile: false
    })).to.eventually.deep.equal(output);
  });

  it('should format numbers correctly', function() {
    var result = report.helpers.formatNumber(5);
    expect(result).to.eq('5');
    result = report.helpers.formatNumber(5.00);
    expect(result).to.eq('5');
    result = report.helpers.formatNumber(3.33);
    expect(result).to.eq('3.33');
    result = report.helpers.formatNumber(3.123423);
    expect(result).to.eq('3.12');
    result = report.helpers.formatNumber(3.129);
    expect(result).to.eq('3.13');
    result = report.helpers.formatNumber(3123423232);
    expect(result).to.eq('3,123,423,232');
    result = report.helpers.formatNumber(3123423232.4242);
    expect(result).to.eq('3,123,423,232.42');
  });

  it('should not collapse paths if not needed', function() {
    var data = {};
    for (var i = 0; i < 20; i++) {
      data['/path/num' + i] = {count: 1};
    }
    var result = report.helpers.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq(data);
  });

  it('should collapse paths to $wildcard', function() {
    var data = {};
    for (var i = 0; i < 30; i++) {
      data['/path/num' + i] = {count: 1};
    }
    var result = report.helpers.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq({'/path/$wildcard': {count: 30}});
  });

  it('should collapse paths recursively', function() {
    var data = {};
    for (var i = 0; i < 30; i++) {
      data['/path/num' + i + '/next' + i] = {count: 1};
    }
    data['/path/num1/bar/test'] = {count: 1};
    data['/foo'] = {count: 1};
    var result = report.helpers.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq({
      '/path/$wildcard/$wildcard': {count: 30},
      '/path/$wildcard/$wildcard/test': {count: 1},
      '/foo': {count: 1}});
  });

  it('should extract the correct path index', function() {
    var query = {index: {path: ['foo', 'bar']}};
    var result = report.helpers.extractReadableIndex(query);
    expect(result).to.eq('/foo/bar');
  });

  it('should extract the correct value index', function() {
    var query = {index: {}};
    var result = report.helpers.extractReadableIndex(query);
    expect(result).to.eq('.value');
  });
});
