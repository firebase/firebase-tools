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
exports.actuate = exports.askQuestions = void 0;
const clc = __importStar(require("colorette"));
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
    const info = setup.featureInfo?.storage;
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
//# sourceMappingURL=storage.js.map