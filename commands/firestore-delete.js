'use strict';

var chalk = require('chalk');
var Command = require('../lib/command');
var FirestoreDelete = require('../lib/firestore/delete');
var prompt = require('../lib/prompt');
var requireAccess = require('../lib/requireAccess');
var RSVP = require('rsvp');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

var _getConfirmationMessage = function(deleteOp, options) {
  if (options.allCollections) {
    return 'You are about to delete ' + chalk.bold.yellow.underline('YOUR ENTIRE DATABASE')
        + '. Are you sure?';
  }

  if (deleteOp.isDocumentPath) {
    // Recursive document delete
    if (options.recursive) {
      return 'You are about to delete the document at ' + chalk.cyan(deleteOp.path)
          + ' and all of its subcollections. Are you sure?';
    }

    // Shallow document delete
    return 'You are about to delete the document at ' + chalk.cyan(deleteOp.path)
        + '. Are you sure?';
  }

  // Recursive collection delete
  if (options.recursive) {
    return 'You are about to delete all documents in the collection at ' + chalk.cyan(deleteOp.path)
        + ' and all of their subcollections. '
        + 'Are you sure?';
  }

  // Shallow collection delete
  return 'You are about to delete all documents in the collection at ' + chalk.cyan(deleteOp.path)
      + '. Are you sure?';
};

module.exports = new Command('firestore:delete [path]')
  .description('Delete data from Cloud Firestore.')
  .option('-r, --recursive', 'Recursive. Delete all documents and subcollections. '
      + 'Any action which would result in the deletion of child documents will fail if '
      + 'this argument is not passed. May not be passed along with --shallow.')
  .option('--shallow', 'Shallow. Delete only parent documents and ignore documents in '
      + 'subcollections. Any action which would orphan documents will fail if this argument '
      + 'is not passed. May not be passed along with -r.')
  .option('--all-collections', 'Delete all. Deletes the entire Firestore database, '
      + 'including all collections and documents. Any other flags or arguments will be ignored.')
  .option('-y, --yes', 'No confirmation. Otherwise, a confirmation prompt will appear.')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(path, options) {
    // Guarantee path
    if (!path && !options.allCollections) {
      return utils.reject('Must specify a path.', {exit: 1});
    }

    var deleteOp = new FirestoreDelete(options.project, path, {
      recursive: options.recursive,
      shallow: options.shallow,
      batchSize: 50
    });

    var checkPrompt;
    if (options.yes) {
      checkPrompt = RSVP.resolve({ confirm: true });
    } else {
      checkPrompt = prompt(options, [{
        type: 'confirm',
        name: 'confirm',
        default: false,
        message: _getConfirmationMessage(deleteOp, options)
      }]);
    }

    return checkPrompt
      .then(function(res) {
        if (!res.confirm) {
          return utils.reject('Command aborted.', {exit: 1});
        }

        if (options.allCollections) {
          return deleteOp.deleteDatabase();
        }

        return deleteOp.execute();
      });
  });
