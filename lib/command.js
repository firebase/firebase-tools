'use strict';

var RSVP = require('rsvp');
var _ = require('lodash');
var track = require('./track');
var logger = require('./logger');
var utils = require('./utils');
var FirebaseError = require('./error');
var chalk = require('chalk');
var getFirebaseName = require('./getFirebaseName');

var Command = function(cmd) {
  this._cmd = cmd;
  this._name = _.first(cmd.split(' '));
  this._description = null;
  this._options = [];
  this._action = null;
  this._befores = [];
};

Command.prototype.description = function(description) {
  this._description = description;
  return this;
};

Command.prototype.option = function() {
  this._options.push(arguments);
  return this;
};

Command.prototype.before = function(fn) {
  this._befores.push(fn);
  return this;
};

Command.prototype.action = function(fn) {
  this._action = fn;
  return this;
};

// ignoring this in coverage for now since it's just wrapping commander
/* istanbul ignore next */
Command.prototype.register = function(client) {
  this.client = client;
  var program = client.cli;
  var cmd = program.command(this._cmd);
  if (this._description) { cmd.description(this._description); }
  this._options.forEach(function(args) { cmd.option.apply(cmd, args); });

  var self = this;
  cmd.action(function() {
    var runner = self.runner();
    var start = new Date().getTime();
    var options = _.last(_.toArray(arguments));

    var argCount = cmd._args.length;
    if (arguments.length - 1 > argCount) {
      return client.errorOut(
        new FirebaseError('Too many arguments. Run ' + chalk.bold('firebase help ' + cmd._name) + ' for usage instructions', {exit: 1})
      );
    }

    runner.apply(self, arguments).then(function(result) {
      if (utils.getInheritedOption(options, 'json')) {
        console.log(JSON.stringify({
          status: 'success',
          result: result
        }, null, 2));
      }
      var duration = new Date().getTime() - start;
      track(self._name, 'success', duration).then(process.exit);
    }).catch(function(err) {
      if (utils.getInheritedOption(options, 'json')) {
        console.log(JSON.stringify({
          status: 'error',
          error: err.message
        }, null, 2));
      }
      var duration = Date.now() - start;
      var errorEvent = err.exit === 1 ? 'Error (User)' : 'Error (Unexpected)';
      var firebase = getFirebaseName(options, true);
      var preppedMessage = chalk.stripColor(err.message || '').replace(firebase, '<namespace>');

      RSVP.all([
        track(self._name, 'error', duration),
        track(errorEvent, preppedMessage, duration)
      ]).then(function() {
        client.errorOut(err);
      });
    });

    return cmd;
  });
};

Command.prototype._prepare = function(options) {
  if (!process.stdin.isTTY || utils.getInheritedOption(options, 'nonInteractive')) {
    options.nonInteractive = true;
  }
  // allow override of detected non-interactive with --interactive flag
  if (utils.getInheritedOption(options, 'interactive')) {
    options.nonInteractive = false;
  }

  if (utils.getInheritedOption(options, 'debug')) {
    logger.transports.console.level = 'debug';
  }
  if (utils.getInheritedOption(options, 'json')) {
    options.nonInteractive = true;
    logger.transports.console.level = 'none';
  }

  return RSVP.resolve();
};

Command.prototype.runner = function() {
  var self = this;
  return function() {
    var args = _.toArray(arguments);
    var options = _.last(args);

    try {
      var befores = [self._prepare].concat(self._befores);
      var result = befores.shift().call(self, options);
      befores.forEach(function(before) {
        result = result.then(function() {
          return before.call(self, options);
        });
      });
      return result.then(function() {
        return self._action.apply(self, args);
      });
    } catch (e) {
      return RSVP.reject(e);
    }
  };
};

module.exports = Command;
