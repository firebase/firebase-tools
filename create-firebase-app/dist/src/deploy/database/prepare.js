"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepare = void 0;
const clc = require("colorette");
const path = require("path");
const error_1 = require("../../error");
const parseBoltRules_1 = require("../../parseBoltRules");
const rtdb = require("../../rtdb");
const utils = require("../../utils");
const dbRulesConfig = require("../../database/rulesConfig");
function prepare(context, options) {
    const rulesConfig = dbRulesConfig.getRulesConfig(context.projectId, options);
    const next = Promise.resolve();
    if (!rulesConfig || rulesConfig.length === 0) {
        return next;
    }
    const ruleFiles = {};
    const deploys = [];
    rulesConfig.forEach((ruleConfig) => {
        if (!ruleConfig.rules) {
            return;
        }
        ruleFiles[ruleConfig.rules] = null;
        deploys.push(ruleConfig);
    });
    for (const file of Object.keys(ruleFiles)) {
        switch (path.extname(file)) {
            case ".json":
                ruleFiles[file] = options.config.readProjectFile(file);
                break;
            case ".bolt":
                ruleFiles[file] = (0, parseBoltRules_1.parseBoltRules)(file);
                break;
            default:
                throw new error_1.FirebaseError("Unexpected rules format " + path.extname(file));
        }
    }
    context.database = {
        deploys: deploys,
        ruleFiles: ruleFiles,
    };
    utils.logBullet(clc.bold(clc.cyan("database: ")) + "checking rules syntax...");
    return Promise.all(deploys.map((deploy) => {
        return rtdb
            .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], { dryRun: true })
            .then(() => {
            utils.logSuccess(clc.bold(clc.green("database: ")) +
                "rules syntax for database " +
                clc.bold(deploy.instance) +
                " is valid");
        });
    }));
}
exports.prepare = prepare;
