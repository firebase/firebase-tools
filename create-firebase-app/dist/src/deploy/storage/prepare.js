"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const gcp = require("../../gcp");
const rulesDeploy_1 = require("../../rulesDeploy");
const error_1 = require("../../error");
/**
 * Prepares for a Firebase Storage deployment.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function default_1(context, options) {
    let rulesConfig = options.config.get("storage");
    if (!rulesConfig) {
        return;
    }
    const onlyTargets = new Set();
    let allStorage = !options.only;
    if (options.only) {
        const split = options.only.split(",");
        if (split.includes("storage")) {
            allStorage = true;
        }
        else {
            for (const value of split) {
                if (value.startsWith("storage:")) {
                    onlyTargets.add(value.split(":")[1]);
                }
            }
        }
    }
    const rulesDeploy = new rulesDeploy_1.RulesDeploy(options, rulesDeploy_1.RulesetServiceType.FIREBASE_STORAGE);
    const rulesConfigsToDeploy = [];
    if (!Array.isArray(rulesConfig) && options.project) {
        const defaultBucket = await gcp.storage.getDefaultBucket(options.project);
        rulesConfig = [Object.assign(rulesConfig, { bucket: defaultBucket })];
    }
    for (const ruleConfig of rulesConfig) {
        const target = ruleConfig.target;
        if (target) {
            options.rc.requireTarget(context.projectId, "storage", target);
        }
        if (allStorage || onlyTargets.has(target)) {
            rulesDeploy.addFile(ruleConfig.rules); // Add the rules to the deploy object.
            rulesConfigsToDeploy.push(ruleConfig); // Copy the rule config into our list of configs to deploy.
            onlyTargets.delete(target); // Remove the target from our only list.
        }
    }
    if (!allStorage && onlyTargets.size !== 0) {
        throw new error_1.FirebaseError(`Could not find rules for the following storage targets: ${[...onlyTargets].join(", ")}`);
    }
    _.set(context, "storage.rules", rulesConfig);
    _.set(context, "storage.rulesConfigsToDeploy", rulesConfigsToDeploy);
    _.set(context, "storage.rulesDeploy", rulesDeploy);
    await rulesDeploy.compile();
}
exports.default = default_1;
