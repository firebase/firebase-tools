"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actuate = exports.askQuestions = void 0;
const clc = require("colorette");
const logger_1 = require("../../logger");
const prompt_1 = require("../../prompt");
const templates_1 = require("../../templates");
const error_1 = require("../../error");
const RULES_TEMPLATE = (0, templates_1.readTemplateSync)("init/storage/storage.rules");
const DEFAULT_RULES_FILE = "storage.rules";
async function askQuestions(setup, config) {
    logger_1.logger.info();
    logger_1.logger.info("Firebase Storage Security Rules allow you to define how and when to allow");
    logger_1.logger.info("uploads and downloads. You can keep these rules in your project directory");
    logger_1.logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
    logger_1.logger.info();
    const info = {
        rulesFilename: DEFAULT_RULES_FILE,
        rules: RULES_TEMPLATE,
        writeRules: true,
    };
    info.rulesFilename = await (0, prompt_1.input)({
        message: "What file should be used for Storage Rules?",
        default: DEFAULT_RULES_FILE,
    });
    info.writeRules = await config.confirmWriteProjectFile(info.rulesFilename, info.rules);
    // Populate featureInfo for the actuate step later.
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.storage = info;
}
exports.askQuestions = askQuestions;
async function actuate(setup, config) {
    var _a;
    const info = (_a = setup.featureInfo) === null || _a === void 0 ? void 0 : _a.storage;
    if (!info) {
        throw new error_1.FirebaseError("storage featureInfo is not found");
    }
    // Populate defaults and update `firebase.json` config.
    info.rules = info.rules || RULES_TEMPLATE;
    info.rulesFilename = info.rulesFilename || DEFAULT_RULES_FILE;
    setup.config.storage = {
        rules: info.rulesFilename,
    };
    if (info.writeRules) {
        config.writeProjectFile(info.rulesFilename, info.rules);
    }
}
exports.actuate = actuate;
