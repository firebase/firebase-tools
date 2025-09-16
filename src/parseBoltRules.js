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
exports.parseBoltRules = void 0;
const fs = __importStar(require("fs"));
const spawn = __importStar(require("cross-spawn"));
const clc = __importStar(require("colorette"));
const _ = __importStar(require("lodash"));
const error_1 = require("./error");
function parseBoltRules(filename) {
    const ruleSrc = fs.readFileSync(filename, "utf8");
    // Use 'npx' to spawn 'firebase-bolt' so that it can be picked up
    // from either a global install or from local ./node_modules/
    const result = spawn.sync("npx", ["--no-install", "firebase-bolt"], {
        input: ruleSrc,
        timeout: 10000,
        encoding: "utf-8",
    });
    if (result.error && _.get(result.error, "code") === "ENOENT") {
        throw new error_1.FirebaseError("Bolt not installed, run " + clc.bold("npm install -g firebase-bolt"));
    }
    else if (result.error) {
        throw new error_1.FirebaseError("Unexpected error parsing Bolt rules file", {
            exit: 2,
        });
    }
    else if (result.status != null && result.status > 0) {
        throw new error_1.FirebaseError(result.stderr.toString(), { exit: 1 });
    }
    return result.stdout;
}
exports.parseBoltRules = parseBoltRules;
//# sourceMappingURL=parseBoltRules.js.map