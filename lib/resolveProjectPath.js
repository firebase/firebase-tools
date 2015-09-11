'use strict';

var path = require('path');
var detectProjectRoot = require('./detectProjectRoot');

module.exports = function(cwd, filePath) {
  return path.resolve(detectProjectRoot(cwd), filePath);
};
