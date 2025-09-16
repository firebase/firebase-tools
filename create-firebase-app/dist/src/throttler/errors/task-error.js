"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_1 = require("../../error");
class TaskError extends error_1.FirebaseError {
    constructor(taskName, message, options = {}) {
        super(`Task ${taskName} failed: ${message}`, options);
    }
}
exports.default = TaskError;
