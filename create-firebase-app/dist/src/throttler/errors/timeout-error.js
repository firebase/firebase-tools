"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const task_error_1 = require("./task-error");
class TimeoutError extends task_error_1.default {
    constructor(taskName, timeout) {
        super(taskName, `timed out after ${timeout}ms.`);
    }
}
exports.default = TimeoutError;
