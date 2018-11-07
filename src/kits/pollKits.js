/**
 * Wrapper around pollOperations.js specifically for polling functions deployed through kits
 */

"use strict";

var _ = require("lodash");

var gcp = require("../gcp");
var pollOperations = require("../pollOperations");

function _pollKitFunctions(operations) {
  var pollFunction = gcp.cloudfunctions.check;
  var interval = 2 * 1000;

  // Code from functions/release.js
  var retryCondition = function(result) {
    // The error codes from a Google.LongRunning operation follow google.rpc.Code format.

    var retryableCodes = [
      1, // cancelled by client
      4, // deadline exceeded
      10, // aborted (typically due to concurrency issue)
      14, // unavailable
    ];

    if (_.includes(retryableCodes, result.error.code)) {
      return true;
    }
    return false;
  };

  var success = function(op) {
    return Promise.resolve(_.last(op.func.split("/")).match(/[^-]*/)[0]);
  };
  var fail = function(op) {
    return Promise.reject({
      kit: _.last(op.func.split("/")).match(/[^-]*/)[0],
      reason: op.error.message,
    });
  };

  return pollOperations.pollAndRetry(
    operations,
    pollFunction,
    interval,
    success,
    fail,
    retryCondition
  );
}

module.exports = function(operations, printSuccess, printFail) {
  return _pollKitFunctions(operations)
    .then(function(successes) {
      return printSuccess(successes);
    })
    .catch(function(reason) {
      // since poll operations uses Promise.all, will catch immediately on first failure
      return printFail(reason);
    });
};
