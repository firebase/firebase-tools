'use strict';

var fs = require('fs');
var path = require('path');

var npmDependencies = require('./npm-dependencies');

var TEMPLATE_ROOT = path.resolve(__dirname, '../../../../templates/init/functions/javascript/');
var INDEX_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, 'index.js'), 'utf8');
var PACKAGE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, 'package.json'), 'utf8');

module.exports = function(setup, config) {
  return config.askWriteProjectFile('functions/package.json', PACKAGE_TEMPLATE).then(function() {
    return config.askWriteProjectFile('functions/index.js', INDEX_TEMPLATE);
  }).then(function() {
    return npmDependencies.askInstallDependencies(setup, config);
  });
};
