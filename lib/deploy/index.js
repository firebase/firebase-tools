'use strict';

var RSVP = require('rsvp');
var logger = require('../logger');
var api = require('../api');
var chalk = require('chalk');
var _ = require('lodash');
var getFirebaseName = require('../getFirebaseName');
var utils = require('../utils');
var FirebaseError = require('../error');
var track = require('../track');

var TARGETS = {
  hosting: require('./hosting'),
  rules: require('./rules')
};

var _chain = function(fns, context, options, payload) {
  var latest = (fns.shift() || RSVP.resolve)(context, options, payload);
  if (fns.length) {
    return latest.then(function() {
      return _chain(fns, context, options, payload);
    });
  }

  return latest;
};

/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
var deploy = function(targetNames, options) {
  var firebase = getFirebaseName(options);

  var payload = {};
  // a shared context object for deploy targets to decorate as needed
  var context = {firebase: firebase};
  var prepares = [];
  var deploys = [];
  var releases = [];

  for (var i = 0; i < targetNames.length; i++) {
    var targetName = targetNames[i];
    var target = TARGETS[targetName];

    if (!target) {
      return RSVP.reject(new FirebaseError(chalk.bold(targetName) + ' is not a valid deploy target', {exit: 1}));
    }

    if (target.prepare) {
      prepares.push(target.prepare);
    }
    if (target.deploy) {
      deploys.push(target.deploy);
    }
    if (target.release) {
      releases.push(target.release);
    }
  }

  logger.info();
  logger.info(chalk.bold(chalk.gray('===') + ' Deploying to \'' + firebase +  '\'...'));
  logger.info();

  var activeTargets = targetNames.filter(function(t) {
    return options.config.has(t);
  });
  utils.logBullet('deploying ' + chalk.bold(activeTargets.join(',')));

  return _chain(prepares, context, options, payload).then(function() {
    return _chain(deploys, context, options, payload);
  }).then(function() {
    return _chain(releases, context, options, payload);
  }).then(function() {
    return api.request('POST', '/firebase/' + firebase + '/releases', {
      data: payload,
      auth: true,
      origin: api.uploadOrigin
    });
  }).then(function(res) {
    if (_.has(options, 'config.notes.rules')) {
      track('Rules Deploy', options.config.notes.rules);
    }

    logger.info();
    utils.logSuccess(chalk.underline.bold('Deploy complete!'));
    logger.info();
    var deployedHosting = _.contains(targetNames, 'hosting');
    if (deployedHosting) {
      logger.info(chalk.bold('URL:'), utils.addSubdomain(api.hostingOrigin, firebase));
    }
    logger.info(chalk.bold('Dashboard:'), utils.addSubdomain(api.realtimeOrigin, firebase));
    if (deployedHosting) {
      logger.info();
      logger.info('Visit the URL above or run', chalk.bold('firebase open'));
    }
    return res.body;
  });
};

module.exports = deploy;
