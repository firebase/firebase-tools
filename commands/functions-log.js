'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var Command = require('../lib/command');
var FirebaseError = require('../lib/error');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var RSVP = require('rsvp');
var sh = require('shelljs');
var utils = require('../lib/utils');

module.exports = new Command('functions:log [name]')
  .description('read logs from GCF Kubernetes cluster')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .option('-f, --follow', 'tail logs from GCF Kubernetes cluster')
  .before(requireConfig)
  .before(requireAccess)
  .action(function(name, options) {
    if (!sh.which('gcloud')) {
      return RSVP.reject(new FirebaseError(
        'Must install gcloud (https://cloud.google.com/sdk/gcloud/) to use functions:log', {exit: 1}));
    }

    if (!sh.which('kubectl')) {
      return RSVP.reject(new FirebaseError(
        'Must have kubectl for functions:log. Please check that you have latest version of gcloud', {exit: 1}));
    }

    var projectId = getProjectId(options);

    logger.info();
    logger.info(chalk.bold(chalk.gray('===') + ' Connecting to \'' + projectId +  '\' GCF Kubernetes cluster...'));
    logger.info();

    var cmd = 'gcloud container clusters get-credentials gcf-cluster-us-central1-f --project ' + projectId;
    utils.logBullet(cmd);
    var out = sh.exec(cmd, { silent: true }).output;
    if (out.toLowerCase().indexOf('error: ') > -1) {
      return RSVP.reject(new FirebaseError(out, {exit: 1}));
    }

    var kubeContext = 'gke_' + projectId + '_us-central1-f_gcf-cluster-us-central1-f';

    cmd = 'kubectl get pods -o json --context=' + kubeContext;
    utils.logBullet(cmd);
    out = sh.exec(cmd, { silent: true }).output;
    var pods = _.chain(JSON.parse(out).items)
      .pluck('metadata.name')
      .indexBy(function(podName) {
        return podName.substring(0, podName.lastIndexOf('.'));
      })
      .value();

    cmd = 'kubectl logs --context=' + kubeContext;
    if (options.follow) {
      cmd += ' -f';
    }
    if (_.isEmpty(pods)) {
      return RSVP.reject(new FirebaseError(
        'No running functions found. Please try deploying your functions.', {exit: 1}));
    } else if (name) {
      if (pods[name]) {
        cmd += ' ' + pods[name] + ' worker';
      } else {
        return RSVP.reject(new FirebaseError(
          'No running function named (' + chalk.bold(name) + ') found. Please try deploying your functions.', {exit: 1}));
      }
    } else {
      if (_.size(pods) === 1) {
        cmd += ' ' + _.values(pods)[0] + ' worker';
      } else {
        return RSVP.reject(new FirebaseError(
          'Please select one of the available functions: ' + chalk.bold(_.keys(pods).join(', ')), {exit: 1}));
      }
    }
    utils.logSuccess(cmd);
    logger.info();
    if (options.follow) {
      sh.exec(cmd, { silent: false });
    } else {
      out = sh.exec(cmd, { silent: true }).output;
      sh.echo(out);
    }

    return RSVP.resolve(true);
  });
