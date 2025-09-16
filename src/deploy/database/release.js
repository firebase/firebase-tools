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
exports.release = void 0;
const clc = __importStar(require("colorette"));
const rtdb = __importStar(require("../../rtdb"));
const utils = __importStar(require("../../utils"));
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
//# sourceMappingURL=release.js.map