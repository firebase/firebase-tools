"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlineExecutor = exports.QueueExecutor = exports.DEFAULT_RETRY_CODES = void 0;
const queue_1 = require("../../../throttler/queue");
exports.DEFAULT_RETRY_CODES = [429, 409, 503];
function parseErrorCode(err) {
    var _a, _b, _c, _d, _e, _f;
    return (err.status ||
        err.code ||
        ((_b = (_a = err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) ||
        ((_c = err.original) === null || _c === void 0 ? void 0 : _c.code) ||
        ((_f = (_e = (_d = err.original) === null || _d === void 0 ? void 0 : _d.context) === null || _e === void 0 ? void 0 : _e.response) === null || _f === void 0 ? void 0 : _f.statusCode));
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
        this.queue = new queue_1.Queue(Object.assign(Object.assign({}, options), { handler }));
    }
    async run(func, opts) {
        const retryCodes = (opts === null || opts === void 0 ? void 0 : opts.retryCodes) || exports.DEFAULT_RETRY_CODES;
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
