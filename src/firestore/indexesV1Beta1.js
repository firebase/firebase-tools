"use strict";

const api = require("../api");
const clc = require("cli-color");
const FirebaseError = require("../error");
const logger = require("../logger");
const validator = require("./validator");
const _ = require("lodash");

const VALID_INDEX_MODES = ["ASCENDING", "DESCENDING", "ARRAY_CONTAINS"];

/**
 * Create an index if it does not already exist on the specified project.
 *
 * @param {string} projectId the Firestore project Id.
 * @param {object} index a Firestore index speficiation.
 * @param {object[]} existingIndexes array of existing indexes on the project.
 * @return {Promise} a promise for index creation.
 */
var _createIfMissing = function(projectId, index, existingIndexes) {
  var exists = existingIndexes.some(function(x) {
    return equal(x, index);
  });

  if (exists) {
    logger.debug("Skipping existing index: " + JSON.stringify(index));
    return Promise.resolve();
  }

  logger.debug("Creating new index: " + JSON.stringify(index));
  return create(projectId, index);
};

/**
 * Create a number of indexes on a project, chaining the operations
 * in sequence.
 *
 * @param {string} projectId the Firestore project Id.
 * @param {object[]} indexes array of indexes to create.
 * @param {object[]} existingIndexes array of existing indexes on the project.
 * @return {Promise} a promise representing the entire creation chain.
 */
var _createAllChained = function(projectId, indexes, existingIndexes) {
  if (indexes.length === 0) {
    return Promise.resolve();
  }

  var index = indexes.shift();
  return _createIfMissing(projectId, index, existingIndexes).then(function() {
    return _createAllChained(projectId, indexes, existingIndexes);
  });
};

/**
 * Warn the user of any indexes that exist in the project but not
 * in their index file.
 *
 * @param {object[]} indexes array of Firestore indexes to be created.
 * @param {object[]} existingIndexes array of Firestore indexes that exit.
 */
var _logAllMissing = function(indexes, existingIndexes) {
  var hashes = {};

  indexes.forEach(function(index) {
    hashes[hash(index)] = true;
  });

  var missingIndexes = existingIndexes.filter(function(index) {
    return !hashes[hash(index)];
  });

  if (missingIndexes.length > 0) {
    logger.info();
    logger.info(
      clc.bold("NOTE: ") +
        "The following indexes are already deployed but not present in the specified indexes file:"
    );

    printIndexes(missingIndexes, true);
    logger.info();
  }
};

/**
 * Validate an index is correctly formed, throws an exception for all
 * fatal errors.
 *
 * See:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/projects.databases.indexes#Index
 *
 * @param {string} index.collectionId index collection Id.
 * @param {object[]} index.fields array of index field specifications.
 */
var validate = function(index) {
  validator.assertHas(index, "collectionId");
  validator.assertHas(index, "fields");

  index.fields.forEach((field) => {
    validator.assertHas(field, "fieldPath");
    validator.assertHas(field, "mode");
    validator.assertEnum(field, "mode", VALID_INDEX_MODES);
  });
};

var deploy = function(project, indexes) {
  return list(project).then(function(existingIndexes) {
    _logAllMissing(indexes, existingIndexes);
    return _createAllChained(project, indexes, existingIndexes);
  });
};

/**
 * Create an index in the specified project.
 *
 * See:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/projects.databases.indexes#Index
 *
 * @param {string} project the Firestore project Id.
 * @param {string} index.collectionId index collection Id.
 * @param {object[]} index.fields array of index field specifications.
 * @return {Promise} a promise for index creation.
 */
var create = function(project, index) {
  validate(index);

  var url = "projects/" + project + "/databases/(default)/indexes";
  return api.request("POST", "/v1beta1/" + url, {
    auth: true,
    data: index,
    origin: api.firestoreOrigin,
  });
};

/**
 * List all indexes in the specified project.
 *
 * See:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/projects.databases.indexes#Index
 *
 * @param {string} project the Firestore project Id.
 * @return {Promise<object[]>} a promise for an array of indexes.
 */
var list = function(project) {
  var url = "projects/" + project + "/databases/(default)/indexes";

  return api
    .request("GET", "/v1beta1/" + url, {
      auth: true,
      origin: api.firestoreOrigin,
    })
    .then(function(res) {
      var indexes = res.body.indexes || [];
      var result = [];

      // Clean up the index metadata so that they appear in the same
      // format as they would be specified in firestore.indexes.json
      for (var i = 0; i < indexes.length; i++) {
        var index = indexes[i];
        var sanitized = {};

        sanitized.collectionId = index.collectionId;
        sanitized.state = index.state;

        sanitized.fields = index.fields.filter(function(field) {
          return field.fieldPath !== "__name__";
        });

        result.push(sanitized);
      }

      return result;
    });
};

/**
 * Determines if two indexes are equal by comparing their collectionId
 * and field specifications. All other properties are ignored.
 *
 * @param {object} a a Firestore index.
 * @param {object} b a Firestore index.
 * @return {boolean} true if the indexes are equal, false otherwise.
 */
var equal = function(a, b) {
  if (a.collectionId !== b.collectionId) {
    return false;
  }

  if (a.fields.length !== b.fields.length) {
    return false;
  }

  for (var i = 0; i < a.fields.length; i++) {
    var aField = a.fields[i];
    var bField = b.fields[i];

    if (aField.fieldPath !== bField.fieldPath) {
      return false;
    }

    if (aField.mode !== bField.mode) {
      return false;
    }
  }

  return true;
};

/**
 * Create a unique hash for a Firestore index that can be used
 * for deduplication.
 *
 * @param {object} index a Firestore index.
 * @return {string} a unique hash.
 */
var hash = function(index) {
  var result = "";
  result += index.collectionId;
  result += "[";

  for (var i = 0; i < index.fields.length; i++) {
    var field = index.fields[i];

    // Skip __name__ fields
    if (field.fieldPath === "__name__") {
      continue;
    }

    // Append the field description
    result += "(";
    result += field.fieldPath + "," + field.mode;
    result += ")";
  }

  result += "]";

  return result;
};

/**
 * Get a colored, pretty printed representation of an index.
 *
 * @param {object} index a Firestore index.
 * @return {string} string for logging.
 */
var toPrettyString = function(index) {
  var result = "";

  if (index.state) {
    var stateMsg = "[" + index.state + "] ";

    if (index.state === "READY") {
      result += clc.green(stateMsg);
    } else if (index.state === "CREATING") {
      result += clc.yellow(stateMsg);
    } else {
      result += clc.red(stateMsg);
    }
  }

  result += clc.cyan("(" + index.collectionId + ")");
  result += " -- ";

  index.fields.forEach(function(field) {
    if (field.fieldPath === "__name__") {
      return;
    }

    result += "(" + field.fieldPath + "," + field.mode + ") ";
  });

  return result;
};

/**
 * TODO
 */
var makeIndexSpec = function(indexes) {
  return {
    version: "v1beta1",
    indexes: indexes.map((index) => {
      return _.pick(index, ["collectionId", "fields"]);
    }),
  };
};

/**
 * TODO
 */
var printIndexes = function(indexes, pretty) {
  if (pretty) {
    indexes.forEach((index) => {
      logger.info(toPrettyString(index));
    });
  } else {
    logger.info(JSON.stringify(jsonSpec, undefined, 2));
  }
};

module.exports = {
  list,
  deploy,
  validate,
  makeIndexSpec,
  printIndexes,
};
