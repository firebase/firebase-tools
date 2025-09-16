"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBoltRules = void 0;
const fs = require("fs");
const spawn = require("cross-spawn");
const clc = require("colorette");
const _ = require("lodash");
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
