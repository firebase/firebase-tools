"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterTargets = void 0;
const lodash_1 = require("lodash");
const error_1 = require("./error");
/**
 * Filters targets from options with valid targets as specified.
 * @param options CLI options.
 * @param validTargets Targets that are valid.
 * @return List of targets as specified and filtered by options and validTargets.
 */
function filterTargets(options, validTargets) {
    let targets = validTargets.filter((t) => {
        return options.config.has(t);
    });
    if (options.only) {
        targets = (0, lodash_1.intersection)(targets, options.only.split(",").map((opt) => {
            return opt.split(":")[0];
        }));
    }
    else if (options.except) {
        targets = (0, lodash_1.difference)(targets, options.except.split(","));
    }
    if (targets.length === 0) {
        let msg = "Cannot understand what targets to deploy/serve.";
        if (options.only) {
            msg += ` No targets in firebase.json match '--only ${options.only}'.`;
        }
        else if (options.except) {
            msg += ` No targets in firebase.json match '--except ${options.except}'.`;
        }
        if (process.platform === "win32") {
            msg +=
                ' If you are using PowerShell make sure you place quotes around any comma-separated lists (ex: --only "functions,firestore").';
        }
        throw new error_1.FirebaseError(msg);
    }
    return targets;
}
exports.filterTargets = filterTargets;
