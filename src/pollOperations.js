"use strict";

var _ = require("lodash");

var MAX_POLL_RETRIES = 2;

function pollOperation(op, pollFunction, interval, pollFailCount) {
  pollFailCount = pollFailCount || 0;
  return new Promise(function(resolve, reject) {
    function poll() {
      pollFunction(op)
        .then(function(result) {
          if (result.done) {
            resolve(result);
          } else {
            setTimeout(poll, interval);
          }
        })
        .catch(function() {
          if (pollFailCount < MAX_POLL_RETRIES) {
            pollFailCount += 1;
            setTimeout(poll, interval * 2);
          } else {
            reject("Failed to get status of operation.");
          }
        });
    }
    poll();
  });
}

function pollAndRetryOperations(
  operations,
  pollFunction,
  interval,
  printSuccess,
  printFail,
  retryCondition
) {
  // This function assumes that a Google.LongRunning operation is being polled
  return Promise.all(
    _.map(operations, function(op) {
      return pollOperation(op, pollFunction, interval).then(function(result) {
        if (!result.error) {
          return printSuccess(op);
        }
        if (!retryCondition(result)) {
          return printFail(op);
        }

        return op
          .retryFunction()
          .then(function(retriedOperation) {
            return pollOperation(retriedOperation, pollFunction, interval);
          })
          .then(function(retriedResult) {
            if (retriedResult.error) {
              return printFail(op);
            }
            return printSuccess(op);
          });
      });
    })
  );
}

module.exports = {
  pollAndRetry: pollAndRetryOperations,
  poll: pollOperation,
};
