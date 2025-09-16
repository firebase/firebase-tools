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
exports.getRuntimeDelegate = void 0;
const node = __importStar(require("./node"));
const python = __importStar(require("./python"));
const validate = __importStar(require("../validate"));
const error_1 = require("../../../error");
const supported = __importStar(require("./supported"));
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
//# sourceMappingURL=index.js.map