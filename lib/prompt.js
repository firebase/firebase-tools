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

    if (prompts.length && options.parent.silent) {
      return reject(new FirebaseError('Missing prompt data while running in silent mode', {
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
