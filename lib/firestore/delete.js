'use strict';

var api = require('../../lib/api');
var chalk = require('chalk');
var FirebaseError = require('../../lib/error');
var logger = require('../../lib/logger');
var ProgressBar = require('progress');
var RSVP = require('rsvp');
var utils = require('../../lib/utils');

/**
 * Construct a new Firestore delete operation.
 *
 * @constructor
 * @param {string} project the Firestore project ID.
 * @param {string} path path to a document or collection.
 * @param {boolean} options.recursive true if the delete should be recursive.
 * @param {boolean} options.shallow true if the delete should be shallow (non-recursive).
 * @param {number} options.batchSize the number of documents to delete in a batch.
 */
function FirestoreDelete(project, path, options) {
  this.project = project;
  this.path = path;
  this.recursive = Boolean(options.recursive);
  this.shallow = Boolean(options.shallow);
  this.batchSize = options.batchSize || 50;

  this.isDocumentPath = this._isDocumentPath(this.path);
  this.isCollectionPath = this._isCollectionPath(this.path);

  this.allDescendants = this.recursive;
  this.parent = 'projects/' + project + '/databases/(default)/documents';

  this._validateOptions();
}

/**
 * Validate all options, throwing an exception for any fatal errors.
 */
FirestoreDelete.prototype._validateOptions = function() {
  if (this.recursive && this.shallow) {
    throw new FirebaseError('Cannot pass recursive and shallow options together.');
  }

  if (this.isCollectionPath && !this.recursive && !this.shallow) {
    throw new FirebaseError('Must pass recursive or shallow option when deleting a collection.');
  }

  var pieces = this.path.split('/');

  if (pieces.length === 0) {
    throw new FirebaseError('Path length must be greater than zero.');
  }

  var hasEmptySegment = pieces.some(function(piece) {
    return piece.length === 0;
  });

  if (hasEmptySegment) {
    throw new FirebaseError('Path must not have any empty segments.');
  }
};

/**
 * Determine if a path points to a document.
 *
 * @param {string} path a path to a Firestore document or collection.
 * @return {boolean} true if the path points to a document, false
 * if it points to a collection.
 */
FirestoreDelete.prototype._isDocumentPath = function(path) {
  if (!path) {
    return false;
  }

  var pieces = path.split('/');
  return pieces.length % 2 === 0;
};

/**
 * Determine if a path points to a collection.
 *
 * @param {string} path a path to a Firestore document or collection.
 * @return {boolean} true if the path points to a collection, false
 * if it points to a document.
 */
FirestoreDelete.prototype._isCollectionPath = function(path) {
  if (!path) {
    return false;
  }

  return !this._isDocumentPath(path);
};

/**
 * Construct a StructuredQuery to find descendant documents of a collection.
 *
 * See:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/StructuredQuery
 *
 * @param {boolean} allDescendants true if subcollections should be included.
 * @param {number} batchSize maximum number of documents to target (limit).
 * @return {object} a StructuredQuery.
 */
FirestoreDelete.prototype._collectionDescendantsQuery = function(allDescendants, batchSize) {
  var nullChar = String.fromCharCode(0);

  var startAt = this.parent + '/' + this.path + '/' + nullChar;
  var endAt = this.parent + '/' + this.path + nullChar + '/' + nullChar;

  var where = {
    compositeFilter: {
      op: 'AND',
      filters: [
        {
          fieldFilter: {
            field: {
              fieldPath: '__name__'
            },
            op: 'GREATER_THAN_OR_EQUAL',
            value: {
              referenceValue: startAt
            }
          }
        },
        {
          fieldFilter: {
            field: {
              fieldPath: '__name__'
            },
            op: 'LESS_THAN',
            value: {
              referenceValue: endAt
            }
          }
        }
      ]
    }
  };

  return {
    structuredQuery: {
      where: where,
      limit: batchSize,
      from: [{
        allDescendants: allDescendants
      }],
      select: {
        fields: [{fieldPath: '__name__'}]
      }
    }
  };
};

/**
 * Construct a StructuredQuery to find descendant documents of a document.
 * The document itself will not be included
 * among the results.
 *
 * See:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/StructuredQuery
 *
 * @param {boolean} allDescendants true if subcollections should be included.
 * @param {number} batchSize maximum number of documents to target (limit).
 * @return {object} a StructuredQuery.
 */
FirestoreDelete.prototype._docDescendantsQuery = function(allDescendants, batchSize) {
  return {
    structuredQuery: {
      limit: batchSize,
      from: [{
        allDescendants: allDescendants
      }],
      select: {
        fields: [{fieldPath: '__name__'}]
      }
    }
  };
};

/**
 * Query for a batch of 'descendants' of a given path.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {boolean} allDescendants true if subcollections should be included,
 * @param {number} batchSize the maximum size of the batch.
 * @return {Promise<object[]>} a promise for an array of documents.
 */
FirestoreDelete.prototype._getDescendantBatch = function(allDescendants, batchSize) {
  var url;
  var body;
  if (this._isDocumentPath) {
    url = this.parent + '/' + this.path + ':runQuery';
    body = this._docDescendantsQuery(allDescendants, batchSize);
  } else {
    url = this.parent + ':runQuery';
    body = this._collectionDescendantsQuery(allDescendants, batchSize);
  }

  return api.request('POST', '/v1beta1/' + url, {
    auth: true,
    data: body,
    origin: api.firestoreOrigin
  }).then(function(res) {
    // Return the 'document' property for each element in the response,
    // where it exists.
    return res.body.filter(function(x) {
      return x.document;
    }).map(function(x) {
      return x.document;
    });
  });
};

/**
 * Delete an array of Firestore documents.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {object[]} docs an array of Document objects to delete.
 * @return {Promise<number>} a promise for the number of deleted documents.
 */
FirestoreDelete.prototype._deleteDocuments = function(docs) {
  var url = this.parent + ':commit';

  var writes = docs.map(function(doc) {
    return {
      delete: doc.name
    };
  });

  var body = {
    writes: writes
  };

  return api.request('POST', '/v1beta1/' + url, {
    auth: true,
    data: body,
    origin: api.firestoreOrigin
  }).then(function(res) {
    return res.body.writeResults.length;
  });
};

/**
 * Progress bar shared by the class.
 */
FirestoreDelete.progressBar = new ProgressBar(
  'Deleted :current docs (:rate docs/s)',
  { total: Number.MAX_SAFE_INTEGER }
);

/**
 * Repeatedly query for descendants of a path and delete them in batches
 * until no documents remain.
 *
 * @return {Promise} a promise for the entire operation.
 */
FirestoreDelete.prototype._recursiveBatchDelete = function() {
  var self = this;
  return this._getDescendantBatch(this.allDescendants, this.batchSize)
    .then(function(docs) {
      if (docs.length <= 0) {
        return RSVP.resolve();
      }

      return self._deleteDocuments(docs)
        .then(function(numDeleted) {
          // Tick the progress bar
          FirestoreDelete.progressBar.tick(numDeleted);

          // Recurse to delete another batch
          return self._recursiveBatchDelete();
        });
    });
};

/**
 * Delete everything under a given path. If the path represents
 * a document the document is deleted and then all descendants
 * are deleted.
 *
 * @return {Promise} a promise for the entire operation.
 */
FirestoreDelete.prototype._deletePath = function() {
  var initialDelete;
  if (this._isDocumentPath) {
    var doc = { name: this.parent + '/' + this.path };
    initialDelete = this._deleteDocuments([doc])
      .catch(function(err) {
        logger.debug('deletePath:initialDelete:error', err);
        if (this.allDescendants) {
          // On a recursive delete, we are insensitive to
          // failures of the initial delete
          return RSVP.resolve();
        }

        // For a shallow delete, this error is fatal.
        return utils.reject('Unable to delete ' + chalk.cyan(this.path));
      });
  } else {
    initialDelete = RSVP.resolve();
  }

  var self = this;
  return initialDelete.then(function() {
    return self._recursiveBatchDelete();
  });
};

/**
 * List all collection IDs.
 *
 * @return {Promise<string[]>} a promise for an array of collection IDs.
 */
FirestoreDelete.prototype._listCollectionIds = function() {
  var url = '/v1beta1/projects/' + this.project + '/databases/(default)/documents:listCollectionIds';

  return api.request('POST', url, {
    auth: true,
    origin: api.firestoreOrigin
  }).then(function(res) {
    return res.body.collectionIds;
  });
};

/**
 * Delete an entire database by finding and deleting each collection.
 *
 * @return {Promise} a promise for all of the operations combined.
 */
FirestoreDelete.prototype.deleteDatabase = function() {
  var self = this;
  return this._listCollectionIds()
    .catch(function(err) {
      logger.debug('deleteDatabase:listCollectionIds:error', err);
      return utils.reject('Unable to list collection IDs');
    })
    .then(function(collectionIds) {
      var promises = [];

      logger.info('Deleting the following collections: ' + chalk.cyan(collectionIds.join(', ')));

      for (var i = 0; i < collectionIds.length; i++) {
        var collectionId = collectionIds[i];
        var deleteOp = new FirestoreDelete(self.project, collectionId, {
          recursive: true,
          batchSize: self.batchSize
        });

        promises.push(deleteOp.execute());
      }

      return RSVP.all(promises);
    });
};

/**
 * Check if a path has any children. Useful for determining
 * if deleting a path will affect more than one document.
 *
 * @return {Promise<boolean>} a promise that retruns true if the path has
 * children and false otherwise.
 */
FirestoreDelete.prototype.checkHasChildren = function() {
  return this._getDescendantBatch(true, 1)
    .then(function(docs) {
      return docs.length > 0;
    });
};

/**
 * Run the delete operation.
 */
FirestoreDelete.prototype.execute = function() {
  var verifyRecurseSafe;
  if (this.isDocumentPath && !this.recursive && !this.shallow) {
    verifyRecurseSafe = this.checkHasChildren()
      .then(function(multiple) {
        if (multiple) {
          return utils.reject(
            'Document has children, must specify -r or --shallow.',
            {exit: 1});
        }
      });
  } else {
    verifyRecurseSafe = RSVP.resolve();
  }

  var self = this;
  return verifyRecurseSafe.then(function() {
    return self._deletePath();
  });
};

module.exports = FirestoreDelete;
