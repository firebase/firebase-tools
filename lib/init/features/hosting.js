'use strict';

var chalk = require('chalk');
var fs = require('fs');
var RSVP = require('rsvp');

var api = require('../../api');
var logger = require('../../logger');
var prompt = require('../../prompt');

var INDEX_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/hosting/index.html', 'utf8');
var MISSING_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/hosting/404.html', 'utf8');
var DEFAULT_IGNORES = [
  'firebase.json',
  '**/.*',
  '**/node_modules/**'
];

module.exports = function(setup, config) {
  setup.hosting = {};

  logger.info();
  logger.info('Your ' + chalk.bold('public') + ' directory is the folder (relative to your project directory) that');
  logger.info('will contain Hosting assets to be uploaded with ' + chalk.bold('firebase deploy') + '. If you');
  logger.info('have a build process for your assets, use your build\'s output directory.');
  logger.info();

  return prompt(setup.hosting, [
    {
      name: 'public',
      type: 'input',
      default: 'public',
      message: 'What do you want to use as your public directory?'
    },
    {
      name: 'spa',
      type: 'confirm',
      default: false,
      message: 'Configure as a single-page app (rewrite all urls to /index.html)?'
    }
  ]).then(function() {
    setup.config.hosting = {public: setup.hosting.public, ignore: DEFAULT_IGNORES};

    var next;
    if (setup.hosting.spa) {
      setup.config.hosting.rewrites = [
        {source: '**', destination: '/index.html'}
      ];
      next = RSVP.resolve();
    } else {
      // SPA doesn't need a 404 page since everything is index.html
      next = config.askWriteProjectFile(setup.hosting.public + '/404.html', MISSING_TEMPLATE);
    }

    return next.then(function() {
      return api.request('GET', '/firebasejs/releases.json', {
        origin: 'https://www.gstatic.com',
        json: true
      });
    }).then(function(response) {
      return config.askWriteProjectFile(setup.hosting.public + '/index.html', INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version));
    });
  });
};
