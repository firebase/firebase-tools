'use strict';

var chai = require('chai');
var expect = chai.expect;

var triggerRulesGenerator = require('../../lib/triggerRulesGenerator');

describe('triggerRulesGenerator', function() {
  it('should write rules if no existing are provided', function() {
    var result = triggerRulesGenerator({
      '.source': 'somedir',
      myfunction: {
        triggers: {
          database: {path: '/path/to/$mydata', condition: 'newData.exists()'}
        }
      }
    });

    expect(result.path.to.$mydata['.function']).to.deep.eq({
      name: '"myfunction"',
      condition: 'newData.exists()'
    });
  });

  it('should merge with existing rules if they are provided', function() {
    var result = triggerRulesGenerator({
      myfn: {triggers: {database: {path: '/foo/$bar'}}}
    }, {foo: {$bar: {'.read': true}}});

    expect(result.foo.$bar).to.deep.eq({
      '.read': true,
      '.function': {
        name: '"myfn"',
        condition: 'true'
      }
    });
  });

  it('should error out if a path does not start with /', function() {
    expect(function() {
      triggerRulesGenerator({
        wrong: {triggers: {database: {path: 'path/without/slash'}}}
      });
    }).to.throw('Trigger for "wrong" must start with a /');
  });

  it('should error out if functions is not an object', function() {
    expect(function() {
      triggerRulesGenerator(true);
    }).to.throw('must be an object');
  });
});
