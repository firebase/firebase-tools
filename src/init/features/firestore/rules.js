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
exports.initRules = exports.getDefaultRules = exports.DEFAULT_RULES_FILE = void 0;
const clc = __importStar(require("colorette"));
const gcp = __importStar(require("../../../gcp"));
const prompt_1 = require("../../../prompt");
const logger_1 = require("../../../logger");
const utils = __importStar(require("../../../utils"));
const templates_1 = require("../../../templates");
exports.DEFAULT_RULES_FILE = "firestore.rules";
const RULES_TEMPLATE = (0, templates_1.readTemplateSync)("init/firestore/firestore.rules");
function getDefaultRules() {
    const date = utils.thirtyDaysFromNow();
    const formattedForRules = `${date.getFullYear()}, ${date.getMonth() + 1}, ${date.getDate()}`;
    return RULES_TEMPLATE.replace(/{{IN_30_DAYS}}/g, formattedForRules);
}
exports.getDefaultRules = getDefaultRules;
async function initRules(setup, config, info) {
    logger_1.logger.info();
    logger_1.logger.info("Firestore Security Rules allow you to define how and when to allow");
    logger_1.logger.info("requests. You can keep these rules in your project directory");
    logger_1.logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
    logger_1.logger.info();
    info.rulesFilename =
        info.rulesFilename ||
            (await (0, prompt_1.input)({
                message: "What file should be used for Firestore Rules?",
                default: exports.DEFAULT_RULES_FILE,
            }));
    info.rules = getDefaultRules();
    if (setup.projectId) {
        const downloadedRules = await getRulesFromConsole(setup.projectId);
        if (downloadedRules) {
            info.rules = downloadedRules;
            utils.logBullet(`Downloaded the existing Firestore Security Rules from the Firebase console`);
        }
    }
    info.writeRules = await config.confirmWriteProjectFile(info.rulesFilename, info.rules);
}
exports.initRules = initRules;
async function getRulesFromConsole(projectId) {
    const name = await gcp.rules.getLatestRulesetName(projectId, "cloud.firestore");
    if (!name) {
        return null;
    }
    const rules = await gcp.rules.getRulesetContent(name);
    if (rules.length <= 0) {
        return utils.reject("Ruleset has no files", { exit: 1 });
    }
    if (rules.length > 1) {
        return utils.reject("Ruleset has too many files: " + rules.length, { exit: 1 });
    }
    // Even though the rules API allows for multi-file rulesets, right
    // now both the console and the CLI are built on the single-file
    // assumption.
    return rules[0].content;
}
//# sourceMappingURL=rules.js.map