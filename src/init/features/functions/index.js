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
exports.doSetup = void 0;
const clc = __importStar(require("colorette"));
const logger_1 = require("../../../logger");
const prompt_1 = require("../../../prompt");
const requirePermissions_1 = require("../../../requirePermissions");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
const projectConfig_1 = require("../../../functions/projectConfig");
const error_1 = require("../../../error");
const api_1 = require("../../../api");
const supported = __importStar(require("../../../deploy/functions/runtimes/supported"));
const MAX_ATTEMPTS = 5;
/**
 * Set up a new firebase project for functions.
 */
async function doSetup(setup, config, options) {
    const projectId = setup?.rcfile?.projects?.default;
    if (projectId) {
        await (0, requirePermissions_1.requirePermissions)({ ...options, project: projectId });
        await Promise.all([
            (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.functionsOrigin)(), "unused", true),
            (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.runtimeconfigOrigin)(), "unused", true),
        ]);
    }
    setup.functions = {};
    // check if functions have been initialized yet
    if (!config.src.functions) {
        setup.config.functions = [];
        return initNewCodebase(setup, config);
    }
    setup.config.functions = (0, projectConfig_1.normalizeAndValidate)(setup.config.functions);
    const codebases = setup.config.functions.map((cfg) => clc.bold(cfg.codebase));
    logger_1.logger.info(`\nDetected existing codebase(s): ${codebases.join(", ")}\n`);
    const choices = [
        {
            name: "Initialize",
            value: "new",
        },
        {
            name: "Overwrite",
            value: "overwrite",
        },
    ];
    const initOpt = await (0, prompt_1.select)({
        message: "Would you like to initialize a new codebase, or overwrite an existing one?",
        default: "new",
        choices,
    });
    return initOpt === "new" ? initNewCodebase(setup, config) : overwriteCodebase(setup, config);
}
exports.doSetup = doSetup;
/**
 *  User dialogue to set up configuration for functions codebase.
 */
async function initNewCodebase(setup, config) {
    logger_1.logger.info("Let's create a new codebase for your functions.");
    logger_1.logger.info("A directory corresponding to the codebase will be created in your project");
    logger_1.logger.info("with sample code pre-configured.\n");
    logger_1.logger.info("See https://firebase.google.com/docs/functions/organize-functions for");
    logger_1.logger.info("more information on organizing your functions using codebases.\n");
    logger_1.logger.info(`Functions can be deployed with ${clc.bold("firebase deploy")}.\n`);
    let source;
    let codebase;
    if (setup.config.functions.length === 0) {
        source = "functions";
        codebase = "default";
    }
    else {
        let attempts = 0;
        while (true) {
            if (attempts++ >= MAX_ATTEMPTS) {
                throw new error_1.FirebaseError("Exceeded max number of attempts to input valid codebase name. Please restart.");
            }
            codebase = await (0, prompt_1.input)("What should be the name of this codebase?");
            try {
                (0, projectConfig_1.validateCodebase)(codebase);
                (0, projectConfig_1.assertUnique)(setup.config.functions, "codebase", codebase);
                break;
            }
            catch (err) {
                logger_1.logger.error(err);
            }
        }
        attempts = 0;
        while (true) {
            if (attempts >= MAX_ATTEMPTS) {
                throw new error_1.FirebaseError("Exceeded max number of attempts to input valid source. Please restart.");
            }
            attempts++;
            source = await (0, prompt_1.input)({
                message: `In what sub-directory would you like to initialize your functions for codebase ${clc.bold(codebase)}?`,
                default: codebase,
            });
            try {
                (0, projectConfig_1.assertUnique)(setup.config.functions, "source", source);
                break;
            }
            catch (err) {
                logger_1.logger.error(err);
            }
        }
    }
    setup.config.functions.push({
        source,
        codebase,
    });
    setup.functions.source = source;
    setup.functions.codebase = codebase;
    return languageSetup(setup, config);
}
async function overwriteCodebase(setup, config) {
    let codebase;
    if (setup.config.functions.length > 1) {
        const choices = setup.config.functions.map((cfg) => ({
            name: cfg["codebase"],
            value: cfg["codebase"],
        }));
        codebase = await (0, prompt_1.select)({
            message: "Which codebase would you like to overwrite?",
            choices,
        });
    }
    else {
        codebase = setup.config.functions[0].codebase; // only one codebase exists
    }
    const cbconfig = (0, projectConfig_1.configForCodebase)(setup.config.functions, codebase);
    setup.functions.source = cbconfig.source;
    setup.functions.codebase = cbconfig.codebase;
    logger_1.logger.info(`\nOverwriting ${clc.bold(`codebase ${codebase}...\n`)}`);
    return languageSetup(setup, config);
}
/**
 * User dialogue to set up configuration for functions codebase language choice.
 */
async function languageSetup(setup, config) {
    // During genkit setup, always select TypeScript here.
    if (setup.languageOverride) {
        return require("./" + setup.languageOverride).setup(setup, config);
    }
    const choices = [
        {
            name: "JavaScript",
            value: "javascript",
        },
        {
            name: "TypeScript",
            value: "typescript",
        },
        {
            name: "Python",
            value: "python",
        },
    ];
    const language = await (0, prompt_1.select)({
        message: "What language would you like to use to write Cloud Functions?",
        default: "javascript",
        choices,
    });
    const cbconfig = (0, projectConfig_1.configForCodebase)(setup.config.functions, setup.functions.codebase);
    switch (language) {
        case "javascript":
            cbconfig.ignore = [
                "node_modules",
                ".git",
                "firebase-debug.log",
                "firebase-debug.*.log",
                "*.local",
            ];
            break;
        case "typescript":
            cbconfig.ignore = [
                "node_modules",
                ".git",
                "firebase-debug.log",
                "firebase-debug.*.log",
                "*.local",
            ];
            break;
        case "python":
            cbconfig.ignore = ["venv", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"];
            // In practical sense, latest supported runtime will not be a decomissioned runtime,
            // but in theory this doesn't have to be the case.
            cbconfig.runtime = supported.latest("python");
            break;
    }
    setup.functions.languageChoice = language;
    return require("./" + language).setup(setup, config);
}
//# sourceMappingURL=index.js.map