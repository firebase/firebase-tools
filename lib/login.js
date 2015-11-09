'use strict';

var logger = require('../lib/logger');
var FirebaseError = require('../lib/error');
var uuid = require('uuid');
var open = require('open');
var chalk = require('chalk');
var Firebase = require('firebase');
var api = require('../lib/api');
var RSVP = require('rsvp');
var utils = require('../lib/utils');

var ticketsRef = new Firebase(utils.addSubdomain(api.realtimeOrigin, 'firebase')).child('sessionTickets');

module.exports = function() {
  var ticket = uuid.v4();
  var url = api.websiteOrigin + '/login/confirm.html?ticket=' + ticket;
  var ticketRef = ticketsRef.child(ticket);

  return new RSVP.Promise(function(resolve, reject) {
    ticketRef.set({
      created: Firebase.ServerValue.TIMESTAMP
    }, function(err) {
      if (err) {
        reject(new FirebaseError('There was a problem logging in', {original: err}));
      }
      logger.info('Visit this URL on any device to log in:');
      logger.info(chalk.bold.underline(url));
      logger.info();
      logger.info('Waiting for authentication...');
      logger.info();

      // tickets expire after 5 min, so timeout at that point
      setTimeout(function() {
        return reject(new FirebaseError('Authentication timed out.', {
          exit: 1
        }));
      }, 300000);

      var ticketListener = ticketRef.child('result').on('value', function(snap) {
        var auth = snap.val();
        if (snap.exists()) {
          ticketRef.child('result').off('value', ticketListener);
          ticketRef.update({
            result: null,
            consumed: Firebase.ServerValue.TIMESTAMP
          }, function(error) {
            if (error) {
              reject(new FirebaseError('Unexpected error while completing authentication.', {
                original: err,
                exit: 2
              }));
            }
            resolve(auth);
          });
        }
      });

      open(url);
    });
  });
};
