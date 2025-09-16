"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlineExecutor = exports.QueueExecutor = exports.DEFAULT_RETRY_CODES = void 0;
const queue_1 = require("../../../throttler/queue");
exports.DEFAULT_RETRY_CODES = [429, 409, 503];
function parseErrorCode(err) {
    return (err.status ||
        err.code ||
        err.context?.response?.statusCode ||
        err.original?.code ||
        err.original?.context?.response?.statusCode);
}
async function handler(op) {
    try {
        op.result = await op.func();
    }
    catch (err) {
        // Throw retry functions back to the queue where they will be retried
        // with backoffs. To do this we cast a wide net for possible error codes.
        // These can be either TOO MANY REQUESTS (429) errors or CONFLICT (409)
        // errors. This can be a raw error with the correct HTTP code, a raw
        // error with the HTTP code stashed where GCP puts it, or a FirebaseError
        // wrapping either of the previous two cases.
        const code = parseErrorCode(err);
        if (op.retryCodes.includes(code)) {
            throw err;
        }
        err.code = code;
        op.error = err;
    }
    return;
}
/**
 * A QueueExecutor implements the executor interface on top of a throttler queue.
 * Any 429 will be retried within the ThrottlerOptions parameters, but all
 * other errors are rethrown.
 */
class QueueExecutor {
    constructor(options) {
        this.queue = new queue_1.Queue({ ...options, handler });
    }
    async run(func, opts) {
        const retryCodes = opts?.retryCodes || exports.DEFAULT_RETRY_CODES;
        const op = {
            func,
            retryCodes,
        };
        await this.queue.run(op);
        if (op.error) {
            throw op.error;
        }
        return op.result;
    }
}
exports.QueueExecutor = QueueExecutor;
/**
 * Inline executors run their functions right away.
 * Useful for testing.
 */
class InlineExecutor {
    run(func) {
        return func();
    }
}
exports.InlineExecutor = InlineExecutor;
//# sourceMappingURL=executor.js.map