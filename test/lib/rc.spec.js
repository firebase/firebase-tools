'use strict';

var chai = require('chai');
var expect = chai.expect;

var path = require('path');
var RC = require('../../lib/rc');

var fixturesDir = path.resolve(__dirname, '../fixtures');

describe('RC', function() {
  describe('.load', function() {
    it('should load from nearest project directory', function() {
      var result = RC.load(path.resolve(fixturesDir, 'fbrc/conflict'));
      expect(result.projects.default).to.eq('top');
    });

    it('should be an empty object when not in project dir', function() {
      var result = RC.load(__dirname);
      return expect(result.data).to.deep.eq({});
    });

    it('should not throw up on invalid json', function() {
      var result = RC.load(path.resolve(fixturesDir, 'fbrc/invalid'));
      return expect(result.data).to.deep.eq({});
    });
  });

  describe('instance methods', function() {
    var subject;
    beforeEach(function() {
      subject = new RC();
    });

    describe('#addProjectAlias', function() {
      it('should set a value in projects.<alias>', function() {
        expect(subject.addProjectAlias('foo', 'bar')).to.be.false;
        expect(subject.projects.foo).to.eq('bar');
      });
    });

    describe('#removeProjectAlias', function() {
      it('should remove an already set value in projects.<alias>', function() {
        subject.addProjectAlias('foo', 'bar');
        expect(subject.projects.foo).to.eq('bar');
        expect(subject.removeProjectAlias('foo')).to.be.false;
        expect(subject.projects).to.deep.eq({});
      });
    });

    describe('#hasProjects', function() {
      it('should be true if project aliases are set, false if not', function() {
        expect(subject.hasProjects).to.be.false;
        subject.addProjectAlias('foo', 'bar');
        expect(subject.hasProjects).to.be.true;
      });
    });
  });
});
