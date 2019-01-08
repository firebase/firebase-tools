"use strict";

var clc = require("cli-color");
var ProgressBar = require("progress");

var api = require("../api");
var firestore = require("../gcp/firestore");
var FirebaseError = require("../error");
var logger = require("../logger");
var utils = require("../utils");

/**
 * Construct a new Firestore get operation.
 *
 * @constructor
 * @param {string} project the Firestore project ID.
 * @param {string} path path to a document or collection.
 */
function FirestoreGet(project, path, options) {
  this.project = project;
  this.path = path;

  // Remove any leading or trailing slashes from the path
  if (this.path) {
    this.path = this.path.replace(/(^\/+|\/+$)/g, "");
  }

  this.isDocumentPath = this._isDocumentPath(this.path);
  this.isCollectionPath = this._isCollectionPath(this.path);

  this.parent = "projects/" + project + "/databases/(default)/documents";

  this._validateOptions();
}

/**
 * Validate all options, throwing an exception for any fatal errors.
 */
FirestoreGet.prototype._validateOptions = function() {
  var pieces = this.path.split("/");

  if (pieces.length === 0) {
    throw new FirebaseError("Path length must be greater than zero.");
  }

  var hasEmptySegment = pieces.some(function(piece) {
    return piece.length === 0;
  });

  if (hasEmptySegment) {
    throw new FirebaseError("Path must not have any empty segments.");
  }
};

/**
 * Determine if a path points to a document.
 *
 * @param {string} path a path to a Firestore document or collection.
 * @return {boolean} true if the path points to a document, false
 * if it points to a collection.
 */
FirestoreGet.prototype._isDocumentPath = function(path) {
  if (!path) {
    return false;
  }

  var pieces = path.split("/");
  return pieces.length % 2 === 0;
};

/**
 * Determine if a path points to a collection.
 *
 * @param {string} path a path to a Firestore document or collection.
 * @return {boolean} true if the path points to a collection, false
 * if it points to a document.
 */
FirestoreGet.prototype._isCollectionPath = function(path) {
  if (!path) {
    return false;
  }

  return !this._isDocumentPath(path);
};

/**
 * Progress bar shared by the class.
 */
FirestoreGet.progressBar = new ProgressBar("Getd :current docs (:rate docs/s)", {
  total: Number.MAX_SAFE_INTEGER,
});


/**
 * Get everything a firestore document
 *
 * @return {Promise} a promise for the entire operation.
 */
FirestoreGet.prototype._getDocument = function() {
  var doc = { name: this.parent + "/" + this.path };
  return firestore.getDocument(doc)
    .then(function(firestoreDoc) {
      console.log(firestoreDoc);
    })
    .catch(function(err) {
    console.log(err);

    return utils.reject("Unable to get " + clc.cyan(this.path));
  });
};

/**
 * Run the get operation.
 */
FirestoreGet.prototype.execute = function() {
  return this._getDocument();
};

module.exports = FirestoreGet;
