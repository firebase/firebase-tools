'use strict';

var chai = require('chai');
var expect = chai.expect;
chai.use(require('chai-as-promised'));

var RSVP = require('rsvp');
var path = require('path');
var fixturesDir = path.resolve(__dirname, '../fixtures');
var Command = require('../../lib/command');

describe('Command', function() {
  var command;

  beforeEach(function() {
    command = new Command('example');
  });

  it('should initialize the name from the argument', function() {
    expect(new Command('test')._name).to.equal('test');
  });

  it('should set description with a command', function() {
    expect(command.description('test')._description).to.equal('test');
  });

  it('should add an option with a command', function() {
    expect(command
      .option('-f', 'first option')
      .option('-s', 'second option')
      ._options
    ).to.have.length(2);
  });

  it('should add a before with a command', function() {
    expect(command
      .before(function() { })
      .before(function() { })
      ._befores
    ).to.have.length(2);
  });

  it('should set the action with a command', function() {
    var action = function() { };
    expect(command.action(action)._action).to.equal(action);
  });

  describe('.applyPrefs()', function() {
    var run;
    var rcdir = path.resolve(fixturesDir, 'fbrc');

    beforeEach(function() {
      run = command.action(function(options) {
        return RSVP.resolve(options.project);
      }).runner();
    });

    it('should use the specified project if no alias is found', function() {
      return expect(run({
        project: 'my-specific-project',
        cwd: rcdir
      })).to.eventually.eq('my-specific-project');
    });

    it('should use the provided alias if one is found in .firebaserc', function() {
      return expect(run({
        project: 'other',
        cwd: rcdir
      })).to.eventually.eq('top');
    });

    it('should use the default alias if no project is specified and one is found in .firebaserc', function() {
      return expect(run({
        cwd: rcdir
      })).to.eventually.eq('top');
    });
  });

  describe('.runner()', function() {
    it('should work when no arguments are passed and options', function() {
      var run = command.action(function(options) {
        options.foo = 'bar';
        return RSVP.resolve(options);
      }).runner();

      return expect(run({foo: 'baz'})).to.eventually.have.property('foo', 'bar');
    });

    it('should execute befores before the action', function() {
      var run = command.before(function(options) {
        options.foo = true;
        return RSVP.resolve();
      }).action(function(options) {
        if (options.foo) { options.bar = 'baz'; }
        return options;
      }).runner();

      return expect(run({})).to.eventually.have.property('bar');
    });

    it('should terminate execution if a before errors', function() {
      var run = command.before(function() {
        throw new Error('foo');
      }).action(function(options, resolve) {
        resolve(true);
      }).runner();

      return expect(run()).to.be.rejectedWith('foo');
    });

    it('should reject the promise if an error is thrown', function() {
      var run = command.action(function() {
        throw new Error('foo');
      }).runner();

      return expect(run()).to.be.rejectedWith('foo');
    });
  });
});
