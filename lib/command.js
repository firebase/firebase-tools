'use strict';

var RSVP = require('RSVP');
var _ = require('lodash');
var track = require('./track');

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
    runner.apply(self, arguments).then(function() {
      var duration = new Date().getTime() - start;
      track(self._name, 'success', duration).then(process.exit);
    }, function(err) {
      var duration = new Date().getTime() - start;
      track(self._name, 'error', duration).then(function() {
        client.errorOut(err);
      });
    });

    return cmd;
  });
};

Command.prototype.runner = function() {
  var self = this;
  return function() {
    var args = _.toArray(arguments);
    var options = _.last(args);

    try {
      var befores = [RSVP.resolve].concat(self._befores);
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
