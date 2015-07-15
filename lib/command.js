'use strict';

var RSVP = require('RSVP');
var logger = require('./logger');
var chalk = require('chalk');

var Command = function(name) {
  this.name = name;
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

Command.prototype.getAction = function() { return this._action; };

Command.prototype.register = function(client) {
  var program = client.cli;
  var cmd = program.command(this.name);
  if (this._description) { cmd.description(this._description); }
  this._options.forEach(function(args) { cmd.option.apply(cmd, args); });

  var self = this;
  cmd.action(function(options) {
    var tasks = self._befores.concat(self._action);
    tasks.reduce(function(cur, next) {
      return cur.then(function() {
        return new RSVP.Promise(function(resolve, reject) {
          next(options, resolve, reject);
        });
      });
    }, RSVP.resolve()).then(function() {
      logger.info(chalk.green('✔ '), chalk.bold(self.name), 'completed successfully');
      process.exit();
    }, client.errorOut);

    return cmd;
  });
};

module.exports = Command;
