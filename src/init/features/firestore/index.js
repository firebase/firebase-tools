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
const rules = __importStar(require("./rules"));
const indexes = __importStar(require("./indexes"));
const error_1 = require("../../../error");
const api_1 = require("../../../firestore/api");
const prompt_1 = require("../../../prompt");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
const api_2 = require("../../../api");
async function askQuestions(setup, config) {
    const firestore = !Array.isArray(setup.config.firestore) ? setup.config.firestore : undefined;
    const info = {
        databaseId: firestore?.database || "",
        locationId: firestore?.location || "",
        rulesFilename: firestore?.rules || "",
        rules: "",
        writeRules: true,
        indexesFilename: firestore?.indexes || "",
        indexes: "",
        writeIndexes: true,
    };
    if (setup.projectId) {
        await (0, ensureApiEnabled_1.ensure)(setup.projectId, (0, api_2.firestoreOrigin)(), "firestore");
        // Next, use the AppEngine Apps API to check the database type.
        // This allows us to filter out projects that are not using Firestore in Native mode.
        // Will also prompt user for databaseId if default does not exist.
        info.databaseId = info.databaseId || "(default)";
        const api = new api_1.FirestoreApi();
        const databases = await api.listDatabases(setup.projectId);
        const nativeDatabaseNames = databases
            .filter((db) => db.type === "FIRESTORE_NATIVE")
            .map((db) => db.name.split("/")[3]);
        if (nativeDatabaseNames.length === 0) {
            if (databases.length > 0) {
                // Has non-native Firestore databases
                throw new error_1.FirebaseError(`It looks like this project is using Cloud Firestore in ${databases[0].type}. The Firebase CLI can only manage projects using Cloud Firestore in Native mode. For more information, visit https://cloud.google.com/datastore/docs/firestore-or-datastore`, { exit: 1 });
            }
            // Create the default database in deploy later.
            info.databaseId = "(default)";
            const locations = await api.locations(setup.projectId);
            const choice = await (0, prompt_1.select)({
                message: "Please select the location of your Firestore database:",
                choices: locations.map((location) => location.name.split("/")[3]),
                default: "nam5",
            });
            info.locationId = choice;
        }
        else if (nativeDatabaseNames.length === 1) {
            info.databaseId = nativeDatabaseNames[0];
            info.locationId = databases
                .filter((db) => db.name.endsWith(`databases/${info.databaseId}`))
                .map((db) => db.locationId)[0];
        }
        else if (nativeDatabaseNames.length > 1) {
            const choice = await (0, prompt_1.select)({
                message: "Please select the name of the Native Firestore database you would like to use:",
                choices: nativeDatabaseNames,
            });
            info.databaseId = choice;
            info.locationId = databases
                .filter((db) => db.name.endsWith(`databases/${info.databaseId}`))
                .map((db) => db.locationId)[0];
        }
    }
    await rules.initRules(setup, config, info);
    await indexes.initIndexes(setup, config, info);
    // Populate featureInfo for the actuate step later.
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.firestore = info;
}
exports.askQuestions = askQuestions;
async function actuate(setup, config) {
    const info = setup.featureInfo?.firestore;
    if (!info) {
        throw new error_1.FirebaseError("Firestore featureInfo is not found");
    }
    // Populate defaults and update `firebase.json` config.
    info.databaseId = info.databaseId || "(default)";
    info.locationId = info.locationId || "nam5";
    info.rules = info.rules || rules.getDefaultRules();
    info.rulesFilename = info.rulesFilename || rules.DEFAULT_RULES_FILE;
    info.indexes = info.indexes || indexes.INDEXES_TEMPLATE;
    info.indexesFilename = info.indexesFilename || indexes.DEFAULT_INDEXES_FILE;
    setup.config.firestore = {
        database: info.databaseId,
        location: info.locationId,
        rules: info.rulesFilename,
        indexes: info.indexesFilename,
    };
    if (info.writeRules) {
        config.writeProjectFile(info.rulesFilename, info.rules);
    }
    if (info.writeIndexes) {
        config.writeProjectFile(info.indexesFilename, info.indexes);
    }
}
exports.actuate = actuate;
//# sourceMappingURL=index.js.map