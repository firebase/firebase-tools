"use strict";

var inquirer = require("inquirer");
var _ = require("lodash");
var FirebaseError = require("./error");

var prompt = function(options, questions) {
  return new Promise(function(resolve, reject) {
    var prompts = [];
    for (var i = 0; i < questions.length; i++) {
      if (!options[questions[i].name]) {
        prompts.push(questions[i]);
      }
    }

    if (prompts.length && options.nonInteractive) {
      return reject(
        new FirebaseError(
          "Missing required options (" +
            _.uniq(_.map(prompts, "name")).join(", ") +
            ") while running in non-interactive mode",
          {
            children: prompts,
            exit: 1,
          }
        )
      );
    }

    return inquirer.prompt(prompts, function(answers) {
      _.forEach(answers, function(v, k) {
        options[k] = v;
      });
      return resolve(options);
    });
  });
};

/**
 * Allow a one-off prompt when we don't need to ask a bunch of questions.
 */
prompt.once = function(question) {
  question.name = question.name || "question";
  return prompt({}, [question]).then(function(answers) {
    return answers[question.name];
  });
};

prompt.convertLabeledListChoices = function(choices) {
  return choices.map(function(choice) {
    return { checked: choice.checked, name: choice.label };
  });
};

prompt.listLabelToValue = function(label, choices) {
  for (var i = 0; i < choices.length; i++) {
    if (choices[i].label === label) {
      return choices[i].name;
    }
  }
};

module.exports = prompt;
