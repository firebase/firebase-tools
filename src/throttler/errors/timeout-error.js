"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const task_error_1 = __importDefault(require("./task-error"));
class TimeoutError extends task_error_1.default {
    constructor(taskName, timeout) {
        super(taskName, `timed out after ${timeout}ms.`);
    }
}
exports.default = TimeoutError;
//# sourceMappingURL=timeout-error.js.map