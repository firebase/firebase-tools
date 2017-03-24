'use strict';

var RSVP = require('rsvp');
var logger = require('../logger');
var api = require('../api');
var chalk = require('chalk');
var _ = require('lodash');
var getProjectId = require('../getProjectId');
var utils = require('../utils');
var FirebaseError = require('../error');
var track = require('../track');

var TARGETS = {
  hosting: require('./hosting'),
  database: require('./database'),
  functions: require('./functions'),
  storage: require('./storage')
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
  var projectId = getProjectId(options);
  var payload = {};
  // a shared context object for deploy targets to decorate as needed
  var context = {projectId: projectId};
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
  logger.info(chalk.bold(chalk.gray('===') + ' Deploying to \'' + projectId +  '\'...'));
  logger.info();

  utils.logBullet('deploying ' + chalk.bold(targetNames.join(', ')));

  return _chain(prepares, context, options, payload).then(function() {
    return _chain(deploys, context, options, payload);
  }).then(function() {
    utils.logBullet('starting release process (may take several minutes)...');
    return _chain(releases, context, options, payload);
  }).then(function() {
    return api.request('POST', '/v1/projects/' + encodeURIComponent(projectId) + '/releases', {
      data: payload,
      auth: true,
      origin: api.deployOrigin
    });
  }).then(function(res) {
    if (_.has(options, 'config.notes.databaseRules')) {
      track('Rules Deploy', options.config.notes.databaseRules);
    }

    logger.info();
    utils.logSuccess(chalk.underline.bold('Deploy complete!'));
    logger.info();
    var deployedHosting = _.includes(targetNames, 'hosting');
    logger.info(chalk.bold('Project Console:'), utils.consoleUrl(options.project, '/overview'));
    if (deployedHosting) {
      logger.info(chalk.bold('Hosting URL:'), utils.addSubdomain(api.hostingOrigin, options.instance));
    }
    _.forEach(context.functionUrls, function(elem) {
      logger.info(chalk.bold('Function URL'), '(' + elem.funcName + '):', elem.url);
    });
    return res.body;
  });
};

deploy.TARGETS = TARGETS;

module.exports = deploy;
