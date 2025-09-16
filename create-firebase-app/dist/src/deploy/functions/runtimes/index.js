"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeDelegate = void 0;
const node = require("./node");
const python = require("./python");
const validate = require("../validate");
const error_1 = require("../../../error");
const supported = require("./supported");
const factories = [node.tryCreateDelegate, python.tryCreateDelegate];
/**
 * Gets the delegate object responsible for discovering, building, and hosting
 * code of a given language.
 */
async function getRuntimeDelegate(context) {
    const { projectDir, sourceDir, runtime } = context;
    if (runtime && !supported.isRuntime(runtime)) {
        throw new error_1.FirebaseError(`firebase.json specifies invalid runtime ${runtime} for directory ${sourceDir}`);
    }
    validate.functionsDirectoryExists(sourceDir, projectDir);
    for (const factory of factories) {
        const delegate = await factory(context);
        if (delegate) {
            return delegate;
        }
    }
    throw new error_1.FirebaseError(`Could not detect runtime for functions at ${sourceDir}`);
}
exports.getRuntimeDelegate = getRuntimeDelegate;
