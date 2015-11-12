'use strict';

require('shelljs/global');
var _ = require('lodash');
var acquireRefs = require('../lib/acquireRefs');
var chalk = require('chalk');
var Command = require('../lib/command');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var RSVP = require('rsvp');
var utils = require('../lib/utils');

module.exports = new Command('functions:log [function_name]')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .option('-f, --follow', 'tail logs from GCF Kubernetes cluster')
  // .option('-F, --function <function_name>', 'name of function for which to display logs')
  .before(requireConfig)
  .before(requireAccess)
  .action(function(function_name, options) {
    if (!which('gcloud')) {
      logger.info('Sorry, this command requires gcloud');
      exit(1);
    }

    if (!which('kubectl')) {
      logger.info('Sorry, this command requires kubectl');
      exit(1);
    }

    var projectId = getProjectId(options);

    logger.info();
    logger.info(chalk.bold(chalk.gray('===') + ' Connecting to \'' + projectId +  '\' GCF Kubernetes cluster...'));
    logger.info();

    var cmd = 'gcloud config set project ' + projectId;
    utils.logBullet(cmd);
    exec(cmd, {silent:true});

    cmd = 'gcloud config set container/cluster gcf-cluster-us-central1-f';
    utils.logBullet(cmd);
    exec(cmd, {silent:true});

    cmd = 'gcloud container clusters get-credentials gcf-cluster-us-central1-f';
    utils.logBullet(cmd);
    exec(cmd, {silent:true});

    cmd = 'kubectl get pods -o json';
    utils.logBullet(cmd);
    var out = exec(cmd, {silent:true}).output;
    var pods = _.chain(JSON.parse(out).items)
      .pluck('metadata.name')
      .indexBy(function(name) {
          return name.substring(0, name.lastIndexOf('.'));
      })
      .value();

    cmd = 'kubectl logs';
    if (_.has(options, 'follow')) {
      cmd += ' -f';
    }
    if (_.isEmpty(pods)) {
      logger.info('Sorry, no running pod found.');
      exit(1);
    } else if (function_name) {
      if (pods[function_name]) {
        cmd += ' ' + pods[function_name] + ' worker';
      } else {
        logger.warn('Sorry, no running pod found for given function name ' + chalk.bold(function_name));
        exit(1);
      }
    } else {
      if (_.size(pods) == 1) {
        cmd += ' ' + _.values(pods)[0] + ' worker';
      } else {
        logger.info('Please select one of the available functions: ' + chalk.bold(_.keys(pods).join(', ')));
        exit(1);
      }
    }
    utils.logSuccess(cmd);
    logger.info();
    if (_.has(options, 'follow')) {
      exec(cmd, {silent:false});
    } else {
      var out = exec(cmd, {silent:true}).output;
      echo(out);
    }

    return RSVP.resolve('done');
  });
