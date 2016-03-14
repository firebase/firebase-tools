'use strict';

var fs = require('fs');
var RSVP = require('rsvp');
var api = require('../../api');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  var rulesPath = options.config.get('storage.rules');
  if (rulesPath) {
    rulesPath = options.config.path(rulesPath);
    var src = fs.readFileSync(rulesPath, 'utf8');
    utils.logBullet(chalk.bold.cyan('storage:') + ' checking rules for compilation errors...');
    return api.request('POST', '/v1/projects/' + encodeURIComponent(options.project) + ':test', {
      origin: api.rulesOrigin,
      data: {
        source: {
          files: [{
            content: src,
            name: 'storage.rules'
          }]
        }
      },
      auth: true
    }).then(function(response) {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        var add = response.body.issues.length === 1 ? '' : 's';
        var message = 'Compilation error' + add + ' in ' + chalk.bold(options.config.get('storage.rules')) + ':\n';
        response.body.issues.forEach(function(issue) {
          message += '\n[' + issue.severity.substring(0, 1) + '] ' + issue.sourcePosition.line + ':' + issue.sourcePosition.column + ' - ' + issue.description;
        });

        return utils.reject(message, {exit: 1});
      }

      utils.logSuccess(chalk.bold.green('storage:') + ' rules file compiled successfully');
      payload.storage = {rules: [
        {name: options.config.get('storage.rules'), content: src}
      ]};
      return RSVP.resolve();
    });
  }

  return RSVP.resolve();
};
