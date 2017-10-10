'use strict';

var _ = require('lodash');
var configstore = require('./configstore');

var previews = _.assign({
  // insert previews here...
}, configstore.get('previews'));

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(',').forEach(function(feature) {
    if (_.has(previews, feature)) {
      _.set(previews, feature, true);
    }
  });
}

module.exports = previews;
