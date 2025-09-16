"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actuate = exports.askQuestions = exports.DEFAULT_RULES = void 0;
const clc = require("colorette");
const prompt_1 = require("../../prompt");
const logger_1 = require("../../logger");
const utils = require("../../utils");
const database_1 = require("../../management/database");
const ora = require("ora");
const ensureApiEnabled_1 = require("../../ensureApiEnabled");
const getDefaultDatabaseInstance_1 = require("../../getDefaultDatabaseInstance");
const error_1 = require("../../error");
const apiv2_1 = require("../../apiv2");
const api_1 = require("../../api");
const DEFAULT_RULES_FILENAME = "database.rules.json";
exports.DEFAULT_RULES = JSON.stringify({ rules: { ".read": "auth != null", ".write": "auth != null" } }, null, 2);
async function getDBRules(instanceDetails) {
    if (!instanceDetails || !instanceDetails.name) {
        return exports.DEFAULT_RULES;
    }
    const client = new apiv2_1.Client({ urlPrefix: instanceDetails.databaseUrl });
    const response = await client.request({
        method: "GET",
        path: "/.settings/rules.json",
        responseType: "stream",
        resolveOnHTTPError: true,
    });
    if (response.status !== 200) {
        throw new error_1.FirebaseError(`Failed to fetch current rules. Code: ${response.status}`);
    }
    return await response.response.text();
}
function writeDBRules(rules, filename, config) {
    config.writeProjectFile(filename, rules);
    logger_1.logger.info(`Future modifications to ${clc.bold(filename)} will update Realtime Database Security Rules when you run`);
    logger_1.logger.info(clc.bold("firebase deploy") + ".");
}
async function createDefaultDatabaseInstance(project) {
    const selectedLocation = await (0, prompt_1.select)({
        message: "Please choose the location for your default Realtime Database instance:",
        choices: [
            { name: "us-central1", value: database_1.DatabaseLocation.US_CENTRAL1 },
            { name: "europe-west1", value: database_1.DatabaseLocation.EUROPE_WEST1 },
            { name: "asia-southeast1", value: database_1.DatabaseLocation.ASIA_SOUTHEAST1 },
        ],
    });
    let instanceName = `${project}-default-rtdb`;
    // check if the conventional default instance name is available.
    const checkOutput = await (0, database_1.checkInstanceNameAvailable)(project, instanceName, database_1.DatabaseInstanceType.DEFAULT_DATABASE, selectedLocation);
    // if the conventional instance name is not available, pick the first suggestion.
    if (!checkOutput.available) {
        if (!checkOutput.suggestedIds || checkOutput.suggestedIds.length === 0) {
            logger_1.logger.debug(`No instance names were suggested instead of conventional instance name: ${instanceName}`);
            throw new error_1.FirebaseError("Failed to create default RTDB instance");
        }
        instanceName = checkOutput.suggestedIds[0];
        logger_1.logger.info(`${clc.yellow("WARNING:")} your project ID has the legacy name format, so your default Realtime Database instance will be named differently: ${instanceName}`);
    }
    const spinner = ora(`Creating your default Realtime Database instance: ${instanceName}`).start();
    try {
        const createdInstance = await (0, database_1.createInstance)(project, instanceName, selectedLocation, database_1.DatabaseInstanceType.DEFAULT_DATABASE);
        spinner.succeed();
        return createdInstance;
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
}
async function initializeDatabaseInstance(projectId) {
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.rtdbManagementOrigin)(), "database", false);
    logger_1.logger.info();
    const instance = await (0, getDefaultDatabaseInstance_1.getDefaultDatabaseInstance)({ project: projectId });
    if (instance !== "") {
        return await (0, database_1.getDatabaseInstanceDetails)(projectId, instance);
    }
    const createDefault = await (0, prompt_1.confirm)({
        message: "It seems like you haven’t initialized Realtime Database in your project yet. Do you want to set it up?",
        default: true,
    });
    if (createDefault) {
        return await createDefaultDatabaseInstance(projectId);
    }
    return null;
}
/**
 * doSetup is the entry point for setting up the database product.
 * @param setup information helpful for database setup
 * @param config legacy config parameter. not used for database setup.
 */
async function askQuestions(setup, config) {
    logger_1.logger.info();
    logger_1.logger.info("Firebase Realtime Database Security Rules allow you to define how your data should be");
    logger_1.logger.info("structured and when your data can be read from and written to.");
    logger_1.logger.info();
    const rulesFilename = await (0, prompt_1.input)({
        message: "What file should be used for Realtime Database Security Rules?",
        default: DEFAULT_RULES_FILENAME,
    });
    if (!rulesFilename) {
        throw new error_1.FirebaseError("Must specify location for Realtime Database rules file.");
    }
    const info = {
        rulesFilename,
        rules: exports.DEFAULT_RULES,
        writeRules: true,
    };
    if (setup.projectId) {
        const instanceDetails = await initializeDatabaseInstance(setup.projectId);
        if (instanceDetails) {
            info.rules = await getDBRules(instanceDetails);
            utils.logBullet(`Downloaded the existing Realtime Database Security Rules of database ${clc.bold(instanceDetails.name)} from the Firebase console`);
        }
    }
    info.writeRules = await config.confirmWriteProjectFile(rulesFilename, info.rules);
    // Populate featureInfo for the actuate step later.
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.database = info;
}
exports.askQuestions = askQuestions;
async function actuate(setup, config) {
    var _a;
    const info = (_a = setup.featureInfo) === null || _a === void 0 ? void 0 : _a.database;
    if (!info) {
        throw new error_1.FirebaseError("No database RequiredInfo found in setup actuate.");
    }
    // Populate defaults and update `firebase.json` config.
    info.rules = info.rules || exports.DEFAULT_RULES;
    info.rulesFilename = info.rulesFilename || "database.rules.json";
    setup.config.database = { rules: info.rulesFilename };
    if (info.writeRules) {
        if (info.rules === exports.DEFAULT_RULES) {
            writeDBRules(info.rules, info.rulesFilename, config);
        }
        else {
            writeDBRules(info.rules, info.rulesFilename, config);
        }
    }
    else {
        logger_1.logger.info("Skipping overwrite of Realtime Database Security Rules.");
        logger_1.logger.info(`The security rules defined in ${clc.bold(info.rulesFilename)} will be published when you run ${clc.bold("firebase deploy")}.`);
    }
    return Promise.resolve();
}
exports.actuate = actuate;
