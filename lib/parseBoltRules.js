'use strict';

var fs = require('fs');
var spawn = require('cross-spawn');
var FirebaseError = require('./error');
var chalk = require('chalk');

module.exports = function(filename) {
  var ruleSrc = fs.readFileSync(filename);

  var result = spawn.sync('firebase-bolt', {
    input: ruleSrc,
    timeout: 10000,
    encoding: 'utf-8'
  });

  if (result.error && result.error.code === 'ENOENT') {
    throw new FirebaseError('Bolt not installed, run ' + chalk.bold('npm install -g firebase-bolt'), {exit: 1});
  } else if (result.error) {
    throw new FirebaseError('Unexpected error parsing Bolt rules file', {exit: 2});
  } else if (result.status > 0) {
    throw new FirebaseError(result.stderr, {exit: 1});
  }

  return result.stdout;
};
