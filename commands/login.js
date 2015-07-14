'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var FirebaseError = require('../lib/error');
var configstore = require('../lib/configstore');
var uuid = require('uuid');
var open = require('open');
var chalk = require('chalk');
var Firebase = require('firebase');

var ticketsRef = new Firebase('https://gauth.firebaseio.com/tickets');

module.exports = new Command('login')
  .description('sign in to your Google account')
  .action(function(options, resolve) {
    var user = configstore.get('user');
    if (user) {
      logger.info('Already logged in as', chalk.bold(user.google.email));
      resolve(user);
    } else {
      var ticket = uuid.v4();
      var url = 'https://gauth.firebaseapp.com/?ticket=' + ticket;
      // allow 5 minutes to consume the ticket

      var ticketRef = ticketsRef.child(ticket);
      ticketRef.set({
        createdAt: Firebase.ServerValue.TIMESTAMP
      }, function(err) {
        if (err) { throw new FirebaseError(); }
        logger.info('Visit this URL to log in:');
        logger.info(chalk.bold.underline(url));
        logger.info();
        logger.info('Waiting for authentication...');

        ticketRef.child('result').on('value', function(snap) {
          var auth = snap.val();
          if (auth) {
            ticketRef.update({
              result: null,
              consumedAt: Firebase.ServerValue.TIMESTAMP
            });
            ticketRef.child('result').off('value');
            configstore.set('user', auth);
            logger.info('Success! Logged in as', chalk.bold(auth.google.email));
            resolve(auth);
          }
        });

        open(url);
      });
    }
  });
