'use strict';

var chalk = require('chalk');
var fs = require('fs');

var prompt = require('../../prompt');
var logger = require('../../logger');

var RULES_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/firestore/firestore.rules', 'utf8');
var INDEXES_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/firestore/firestore.indexes.json', 'utf8');

var _initRules = function(setup, config) {
  logger.info();
  logger.info('Firestore Security Rules allow you to define how and when to allow');
  logger.info('requests. You can keep these rules in your project directory');
  logger.info('and publish them with ' + chalk.bold('firebase deploy') + '.');
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: 'input',
      name: 'rules',
      message: 'What file should be used for Firestore Rules?',
      default: 'firestore.rules'
    }
  ]).then(function() {
    return config.writeProjectFile(setup.config.firestore.rules, RULES_TEMPLATE);
  });
};

var _initIndexes = function(setup, config) {
  logger.info();
  logger.info('Firestore indexes allow you to perform complex queries while');
  logger.info('maintaining performance that scales with the size of the result');
  logger.info('set. You can keep index definitions in your project directory');
  logger.info('and publish them with ' + chalk.bold('firebase deploy') + '.');
  logger.info();


  return prompt(setup.config.firestore, [
    {
      type: 'input',
      name: 'indexes',
      message: 'What file should be used for Firestore indexes?',
      default: 'firestore.indexes.json'
    }
  ]).then(function() {
    return config.writeProjectFile(setup.config.firestore.indexes, INDEXES_TEMPLATE);
  });
};

module.exports = function(setup, config) {
  setup.config.firestore = {};

  return _initRules(setup, config)
    .then(function() {
      return _initIndexes(setup, config);
    });
};
