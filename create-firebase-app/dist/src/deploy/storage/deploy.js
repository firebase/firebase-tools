"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const rulesDeploy_1 = require("../../rulesDeploy");
/**
 * Deploys Firebase Storage rulesets.
 * @param context The deploy context.
 */
async function default_1(context) {
    const rulesDeploy = (0, lodash_1.get)(context, "storage.rulesDeploy");
    if (!rulesDeploy) {
        return;
    }
    await rulesDeploy.createRulesets(rulesDeploy_1.RulesetServiceType.FIREBASE_STORAGE);
}
exports.default = default_1;
