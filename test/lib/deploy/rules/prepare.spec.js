'use strict';

var chai = require('chai');
chai.use(require('chai-as-promised'));
var expect = chai.expect;
var prepare = require('../../../../lib/deploy/rules/prepare');
var Config = require('../../../../lib/config');

describe('deploy rules [prepare step]', function() {
  it('should error out if .function is defined in rules', function() {
    return expect(prepare({}, {config: new Config({
      rules: {
        abc: {'.function': {name: '"myfunc"', condition: 'true'}}
      }
    }, {})}, {})).to.be.rejectedWith('Cannot define .function in rules, please use functions config instead');
  });
});
