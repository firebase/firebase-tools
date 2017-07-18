var _ = require('lodash');

function pollOperation(op, pollFunction, interval, doneFilter) {
	return new RSVP.Promise(function(resolve, reject) {
		function poll() {
			pollFunction(op).then(function(result) {
				if (doneFilter(result)) {
					resolve(result);
				}
				// not sure if we need this, check operation proto
				// if (errorFilter(result)) {
				// 	reject(result);
				// }
			});
		}
		setTimeout(poll, POLL_INTERVAL);
	})

}

function pollAndRetryOperations(operations, pollFunction, interval, doneFilter, errorFilter, successMessage, failMessage, retryCondition, retryFunction, retryParams) {
  // TODO figure out timer
	
	return RSVP.all(_.map(operations, function(operation) {
		return pollOperation(operation, pollFunction, interval, doneFilter, errorFilter).then(function(result) {
			if (!errorFilter(result)) {
				return successMessage(result);
			}

			if (!retryCondition(result)) {
				return failMessage(result);
			}

			return retryFunction(retryParams).then(function(retriedOperation) {
				return pollOperation(retriedOperation, pollFunction, interval, doneFilter, errorFilter);
			}).then(function(retriedResult) {
				if (errorFilter(result)) {
					return failMessage(result);
				}
				return successMessage(result)
			});

		}).catch(function() {
			// failed to get status
		});
	}));


}