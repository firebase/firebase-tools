'use strict';

var inquirer = require('inquirer');
var _ = require('lodash');
var FirebaseError = require('./error');
var RSVP = require('rsvp');

module.exports = function(options, questions) {
  return new RSVP.Promise(function(resolve, reject) {
    var prompts = [];
    for (var i = 0; i < questions.length; i++) {
      if (!options[questions[i].name]) {
        prompts.push(questions[i]);
      }
    }

    if (prompts.length && options.nonInteractive) {
      return reject(new FirebaseError('Missing required options (' + _.uniq(_.pluck(prompts, 'name')).join(', ') + ') while running in non-interactive mode', {
        children: prompts,
        exit: 1
      }));
    }

    return inquirer.prompt(prompts, function(answers) {
      _.forEach(answers, function(v, k) {
        options[k] = v;
      });
      return resolve(options);
    });
  });
};
