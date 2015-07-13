'use strict';

var RSVP = require('RSVP');
var logger = require('./logger');
var chalk = require('chalk');

var Command = function(name) {
  this.name = name;
  this._description = null;
  this._options = [];
  this._action = null;
};

Command.prototype.description = function(description) {
  this._description = description;
  return this;
};

Command.prototype.option = function() {
  this._options.push(arguments);
  return this;
};

Command.prototype.action = function(fn) {
  this._action = function(options) {
    options = options || {};
    return new RSVP.Promise(function(resolve, reject) {
      fn(options, resolve, reject);
    });
  };
  return this;
};

Command.prototype.getAction = function() { return this._action; };

Command.prototype.register = function(client) {
  var program = client.cli;
  var cmd = program.command(this.name);
  if (this._description) { cmd.description(this._description); }
  this._options.forEach(function(args) { cmd.option.apply(cmd, args); });

  var self = this;
  cmd.action(function(options) {
    self._action(options).then(function() {
      logger.info(chalk.bold(this.name), 'completed successfully');
    }, client.errorOut);
  });

  return cmd;
};

module.exports = Command;
