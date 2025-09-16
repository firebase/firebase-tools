"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
const clc = require("colorette");
const logger_1 = require("../../logger");
class ErrorHandler {
    constructor() {
        this.errors = [];
    }
    record(instanceId, type, message) {
        this.errors.push({
            instanceId,
            type,
            message: message,
        });
    }
    print() {
        logger_1.logger.info("");
        logger_1.logger.info("Extensions deploy had errors:");
        logger_1.logger.info("");
        for (const err of this.errors) {
            logger_1.logger.info(`- ${err.type} ${clc.bold(err.instanceId)}`);
            logger_1.logger.info(err.message);
            logger_1.logger.info("");
        }
    }
    hasErrors() {
        return this.errors.length > 0;
    }
}
exports.ErrorHandler = ErrorHandler;
