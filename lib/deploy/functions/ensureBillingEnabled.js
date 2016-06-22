'use strict';

var api = require('../../api');
var utils = require('../../utils');

module.exports = function(projectId) {
  return api.request('GET', '/v1/projects/' + encodeURIComponent(projectId) + '/billingInfo', {
    auth: true,
    origin: api.billingOrigin
  }).then(function(response) {
    var enabled = response.body.billingEnabled;
    if (!enabled) {
      return utils.reject('Firebase Functions is only available to Firebase apps on a paid plan. '
      + 'Please upgrade your project to a paid plan using the Firebase Console: '
      + 'https://console.firebase.google.com/project/' + projectId + '/overview');
    }
  });
};
