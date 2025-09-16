"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDatabaseInstance = exports.MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE = void 0;
const clc = __importStar(require("colorette"));
const error_1 = require("./error");
const getDefaultDatabaseInstance_1 = require("./getDefaultDatabaseInstance");
/**
 * Error message to be returned when the default database instance is found to be missing.
 */
exports.MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE = `It looks like you haven't created a Realtime Database instance in this project before. Please run ${clc.bold(clc.underline("firebase init database"))} to create your default Realtime Database instance.`;
/**
 * Ensures that the supplied options have an instance set. If not, tries to fetch the default instance.
 * @param options command options
 * @return void promise.
 */
async function requireDatabaseInstance(options) {
    if (options.instance) {
        return;
    }
    let instance;
    try {
        instance = await (0, getDefaultDatabaseInstance_1.getDefaultDatabaseInstance)(options);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get details for project: ${options.project}.`, {
            original: (0, error_1.getError)(err),
        });
    }
    if (instance === "") {
        throw new error_1.FirebaseError(exports.MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE);
    }
    options.instance = instance;
}
exports.requireDatabaseInstance = requireDatabaseInstance;
//# sourceMappingURL=requireDatabaseInstance.js.map