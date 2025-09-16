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
exports.initIndexes = exports.INDEXES_TEMPLATE = exports.DEFAULT_INDEXES_FILE = void 0;
const clc = __importStar(require("colorette"));
const error_1 = require("../../../error");
const api = __importStar(require("../../../firestore/api"));
const prompt_1 = require("../../../prompt");
const utils = __importStar(require("../../../utils"));
const logger_1 = require("../../../logger");
const templates_1 = require("../../../templates");
const indexes = new api.FirestoreApi();
exports.DEFAULT_INDEXES_FILE = "firestore.indexes.json";
exports.INDEXES_TEMPLATE = (0, templates_1.readTemplateSync)("init/firestore/firestore.indexes.json");
async function initIndexes(setup, config, info) {
    logger_1.logger.info();
    logger_1.logger.info("Firestore indexes allow you to perform complex queries while");
    logger_1.logger.info("maintaining performance that scales with the size of the result");
    logger_1.logger.info("set. You can keep index definitions in your project directory");
    logger_1.logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
    logger_1.logger.info();
    info.indexesFilename =
        info.indexesFilename ||
            (await (0, prompt_1.input)({
                message: "What file should be used for Firestore indexes?",
                default: exports.DEFAULT_INDEXES_FILE,
            }));
    info.indexes = exports.INDEXES_TEMPLATE;
    if (setup.projectId) {
        const downloadIndexes = await getIndexesFromConsole(setup.projectId, info.databaseId);
        if (downloadIndexes) {
            info.indexes = downloadIndexes;
            utils.logBullet(`Downloaded the existing Firestore indexes from the Firebase console`);
        }
    }
    info.writeRules = await config.confirmWriteProjectFile(info.indexesFilename, info.indexes);
}
exports.initIndexes = initIndexes;
async function getIndexesFromConsole(projectId, databaseId) {
    const indexesPromise = indexes.listIndexes(projectId, databaseId);
    const fieldOverridesPromise = indexes.listFieldOverrides(projectId, databaseId);
    try {
        const res = await Promise.all([indexesPromise, fieldOverridesPromise]);
        return JSON.stringify(indexes.makeIndexSpec(res[0], res[1]), null, 2);
    }
    catch (e) {
        if (e.status === 404) {
            return null; // Database is not found
        }
        if (e.message.indexOf("is not a Cloud Firestore enabled project") >= 0) {
            return null;
        }
        throw new error_1.FirebaseError("Error fetching Firestore indexes", {
            original: e,
        });
    }
}
//# sourceMappingURL=indexes.js.map