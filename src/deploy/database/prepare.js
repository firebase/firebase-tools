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
exports.prepare = void 0;
const clc = __importStar(require("colorette"));
const path = __importStar(require("path"));
const error_1 = require("../../error");
const parseBoltRules_1 = require("../../parseBoltRules");
const rtdb = __importStar(require("../../rtdb"));
const utils = __importStar(require("../../utils"));
const dbRulesConfig = __importStar(require("../../database/rulesConfig"));
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
//# sourceMappingURL=prepare.js.map