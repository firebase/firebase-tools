"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const task_error_1 = __importDefault(require("./task-error"));
class RetriesExhaustedError extends task_error_1.default {
    constructor(taskName, totalRetries, lastTrialError) {
        super(taskName, `retries exhausted after ${totalRetries + 1} attempts, with error: ${lastTrialError.message}`, {
            original: lastTrialError,
        });
    }
}
exports.default = RetriesExhaustedError;
//# sourceMappingURL=retries-exhausted-error.js.map