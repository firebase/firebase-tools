"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorageRulesConfig = void 0;
const error_1 = require("../../../error");
const fsutils_1 = require("../../../fsutils");
const constants_1 = require("../../constants");
const types_1 = require("../../types");
const emulatorLogger_1 = require("../../emulatorLogger");
const templates_1 = require("../../../templates");
function getSourceFile(rules, options) {
    const path = options.config.path(rules);
    return { name: path, content: (0, fsutils_1.readFile)(path) };
}
/**
 * Parses rules file for each target specified in the storage config under {@link options}.
 * @returns The rules file path if the storage config does not specify a target and an array
 *     of project resources and their corresponding rules files otherwise.
 * @throws {FirebaseError} if storage config is missing or rules file is missing or invalid.
 */
function getStorageRulesConfig(projectId, options) {
    const storageConfig = options.config.data.storage;
    const storageLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE);
    if (!storageConfig) {
        if (constants_1.Constants.isDemoProject(projectId)) {
            storageLogger.logLabeled("BULLET", "storage", `Detected demo project ID "${projectId}", using a default (open) rules configuration.`);
            return defaultStorageRules();
        }
        throw new error_1.FirebaseError("Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration");
    }
    // No target specified
    if (!Array.isArray(storageConfig)) {
        if (!storageConfig.rules) {
            throw new error_1.FirebaseError("Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration");
        }
        return getSourceFile(storageConfig.rules, options);
    }
    // Multiple targets
    const results = [];
    const { rc } = options;
    for (const targetConfig of storageConfig) {
        if (!targetConfig.target) {
            throw new error_1.FirebaseError("Must supply 'target' in Storage configuration");
        }
        const targets = rc.target(projectId, "storage", targetConfig.target);
        if (targets.length === 0) {
            // Fall back to open if this is a demo project
            if (constants_1.Constants.isDemoProject(projectId)) {
                storageLogger.logLabeled("BULLET", "storage", `Detected demo project ID "${projectId}", using a default (open) rules configuration. Storage targets in firebase.json will be ignored.`);
                return defaultStorageRules();
            }
            // Otherwise, requireTarget will error out
            rc.requireTarget(projectId, "storage", targetConfig.target);
        }
        results.push(...rc.target(projectId, "storage", targetConfig.target).map((resource) => {
            return { resource, rules: getSourceFile(targetConfig.rules, options) };
        }));
    }
    return results;
}
exports.getStorageRulesConfig = getStorageRulesConfig;
function defaultStorageRules() {
    const defaultRulesPath = "emulators/default_storage.rules";
    const name = (0, templates_1.absoluteTemplateFilePath)(defaultRulesPath);
    return { name, content: (0, fsutils_1.readFile)(name) };
}
