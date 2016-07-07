'use strict';

var RSVP = require('rsvp');
var FirebaseError = require('./error');

module.exports = function(inStream) {
  return new RSVP.Promise(function(resolve, reject) {
    var input = '';
    inStream.on('data', function(chunk) {
      input += chunk;
    });
    inStream.on('end', function() {
      try {
        input = JSON.parse(input);
        resolve(input);
      } catch (err) {
        reject(new FirebaseError('Improperly formatted JSON.'));
      }
    });
  });
};
