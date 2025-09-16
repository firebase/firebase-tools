"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.release = void 0;
const clc = require("colorette");
const rtdb = require("../../rtdb");
const utils = require("../../utils");
function release(context) {
    if (!context.projectId ||
        !context.database ||
        !context.database.deploys ||
        !context.database.ruleFiles) {
        return Promise.resolve();
    }
    const deploys = context.database.deploys;
    const ruleFiles = context.database.ruleFiles;
    utils.logBullet(clc.bold(clc.cyan("database: ")) + "releasing rules...");
    return Promise.all(deploys.map((deploy) => {
        return rtdb
            .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], {
            dryRun: false,
        })
            .then(() => {
            utils.logSuccess(clc.bold(clc.green("database: ")) +
                "rules for database " +
                clc.bold(deploy.instance) +
                " released successfully");
        });
    }));
}
exports.release = release;
