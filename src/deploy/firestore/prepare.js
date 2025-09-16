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
const clc = __importStar(require("colorette"));
const loadCJSON_1 = require("../../loadCJSON");
const rulesDeploy_1 = require("../../rulesDeploy");
const utils = __importStar(require("../../utils"));
const fsConfig = __importStar(require("../../firestore/fsConfig"));
const logger_1 = require("../../logger");
/**
 * Prepares Firestore Rules deploys.
 * @param context The deploy context.
 * @param rulesDeploy The object encapsulating logic for deploying rules.
 * @param databaseId The id of the database rulesFile corresponds to.
 * @param rulesFile File name for the Firestore rules to be deployed.
 */
function prepareRules(context, rulesDeploy, databaseId, rulesFile) {
    rulesDeploy.addFile(rulesFile);
    context.firestore.rules.push({
        databaseId,
        rulesFile,
    });
}
/**
 * Prepares Firestore Indexes deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 * @param databaseId The id of the database indexesFileName corresponds to.
 * @param indexesFileName File name for the index configs to be parsed from.
 */
function prepareIndexes(context, options, databaseId, indexesFileName) {
    const indexesPath = options.config.path(indexesFileName);
    const indexesRawSpec = (0, loadCJSON_1.loadCJSON)(indexesPath);
    utils.logBullet(`${clc.bold(clc.cyan("firestore:"))} reading indexes from ${clc.bold(indexesFileName)}...`);
    context.firestore.indexes.push({
        databaseId,
        indexesFileName,
        indexesRawSpec,
    });
}
/**
 * Prepares Firestore deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function default_1(context, options) {
    if (options.only) {
        const targets = options.only.split(",");
        // Used for edge case when deploying to a named database
        // https://github.com/firebase/firebase-tools/pull/6129
        const excludeRules = targets.indexOf("firestore:indexes") >= 0;
        const excludeIndexes = targets.indexOf("firestore:rules") >= 0;
        // Used for edge case when deploying --only firestore:rules,firestore:indexes
        // https://github.com/firebase/firebase-tools/issues/6857
        const includeRules = targets.indexOf("firestore:rules") >= 0;
        const includeIndexes = targets.indexOf("firestore:indexes") >= 0;
        const onlyFirestore = targets.indexOf("firestore") >= 0;
        context.firestoreIndexes = !excludeIndexes || includeIndexes || onlyFirestore;
        context.firestoreRules = !excludeRules || includeRules || onlyFirestore;
    }
    else {
        context.firestoreIndexes = true;
        context.firestoreRules = true;
    }
    const firestoreConfigs = fsConfig.getFirestoreConfig(context.projectId, options);
    if (!firestoreConfigs || firestoreConfigs.length === 0) {
        return;
    }
    context.firestore = context.firestore || {};
    context.firestore.indexes = [];
    context.firestore.rules = [];
    const rulesDeploy = new rulesDeploy_1.RulesDeploy(options, rulesDeploy_1.RulesetServiceType.CLOUD_FIRESTORE);
    context.firestore.rulesDeploy = rulesDeploy;
    for (const firestoreConfig of firestoreConfigs) {
        if (firestoreConfig.indexes) {
            prepareIndexes(context, options, firestoreConfig.database, firestoreConfig.indexes);
        }
        if (firestoreConfig.rules) {
            prepareRules(context, rulesDeploy, firestoreConfig.database, firestoreConfig.rules);
        }
    }
    if (context.firestore.rules.length > 0) {
        await rulesDeploy.compile();
    }
    const rulesContext = context?.firestore?.rules;
    for (const ruleContext of rulesContext) {
        const databaseId = ruleContext.databaseId;
        const rulesFile = ruleContext.rulesFile;
        if (!rulesFile) {
            logger_1.logger.error(`Invalid firestore config for ${databaseId} database: ${JSON.stringify(options.config.src.firestore)}`);
        }
    }
}
exports.default = default_1;
//# sourceMappingURL=prepare.js.map