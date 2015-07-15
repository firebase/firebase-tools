'use strict';

var RSVP = require('RSVP');

var Command = function(name) {
  this._name = name;
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
  var program = client.cli;
  var cmd = program.command(this._name);
  if (this._description) { cmd.description(this._description); }
  this._options.forEach(function(args) { cmd.option.apply(cmd, args); });

  var self = this;
  cmd.action(function(options) {
    self.runner()(options).then(function() {
      process.exit();
    }, client.errorOut);

    return cmd;
  });
};

Command.prototype.runner = function() {
  return function(options) {
    options = options || {};
    var tasks = this._befores.concat(this._action);
    return tasks.reduce(function(cur, next) {
      return cur.then(function() {
        return new RSVP.Promise(function(resolve, reject) {
          next(options, resolve, reject);
        });
      });
    }, RSVP.resolve());
  }.bind(this);
};

module.exports = Command;
