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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnoseAndFixProject = exports.getSourceOrigin = exports.isLocalOrURLPath = exports.isLocalPath = exports.isUrlPath = exports.instanceIdExists = exports.promptForRepeatInstance = exports.displayReleaseNotes = exports.getPublisherProjectFromName = exports.createSourceFromLocation = exports.getMissingPublisherError = exports.uploadExtensionVersionFromLocalSource = exports.uploadExtensionVersionFromGitHubSource = exports.unpackExtensionState = exports.getNextVersionByStage = exports.ensureExtensionsPublisherApiEnabled = exports.ensureExtensionsApiEnabled = exports.checkExtensionsApiEnabled = exports.promptForExtensionRoot = exports.promptForValidRepoURI = exports.promptForValidInstanceId = exports.validateSpec = exports.validateCommandLineParams = exports.populateDefaultParams = exports.substituteSecretParams = exports.substituteParams = exports.getFirebaseProjectParams = exports.getDBInstanceFromURL = exports.resourceTypeToNiceName = exports.AUTOPOPULATED_PARAM_PLACEHOLDERS = exports.EXTENSIONS_BUCKET_NAME = exports.URL_REGEX = exports.logPrefix = exports.SourceOrigin = exports.SpecParamType = void 0;
const clc = __importStar(require("colorette"));
const ora = __importStar(require("ora"));
const semver = __importStar(require("semver"));
const tmp = __importStar(require("tmp"));
const fs = __importStar(require("fs-extra"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const path = __importStar(require("path"));
const marked_1 = require("marked");
const marked_terminal_1 = require("marked-terminal");
const unzip_1 = require("./../unzip");
marked_1.marked.use((0, marked_terminal_1.markedTerminal)());
const api_1 = require("../api");
const archiveDirectory_1 = require("../archiveDirectory");
const functionsConfig_1 = require("../functionsConfig");
const adminSdkConfig_1 = require("../emulator/adminSdkConfig");
const error_1 = require("../error");
const diagnose_1 = require("./diagnose");
const askUserForParam_1 = require("./askUserForParam");
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const storage_1 = require("../gcp/storage");
const projectUtils_1 = require("../projectUtils");
const extensionsApi_1 = require("./extensionsApi");
const publisherApi_1 = require("./publisherApi");
const prompt_1 = require("../prompt");
const refs = __importStar(require("./refs"));
const localHelper_1 = require("./localHelper");
const logger_1 = require("../logger");
const utils_1 = require("../utils");
const change_log_1 = require("./change-log");
const getProjectNumber_1 = require("../getProjectNumber");
const constants_1 = require("../emulator/constants");
/**
 * SpecParamType represents the exact strings that the extensions
 * backend expects for each param type in the extensionYaml.
 * This DOES NOT represent the param.type strings that the backend returns in spec.
 * ParamType, defined in extensionsApi.ts, describes the returned strings.
 */
var SpecParamType;
(function (SpecParamType) {
    SpecParamType["SELECT"] = "select";
    SpecParamType["MULTISELECT"] = "multiSelect";
    SpecParamType["STRING"] = "string";
    SpecParamType["SELECTRESOURCE"] = "selectResource";
    SpecParamType["SECRET"] = "secret";
})(SpecParamType = exports.SpecParamType || (exports.SpecParamType = {}));
var SourceOrigin;
(function (SourceOrigin) {
    SourceOrigin["OFFICIAL_EXTENSION"] = "official extension";
    SourceOrigin["LOCAL"] = "unpublished extension (local source)";
    SourceOrigin["PUBLISHED_EXTENSION"] = "published extension";
    SourceOrigin["PUBLISHED_EXTENSION_VERSION"] = "specific version of a published extension";
    SourceOrigin["URL"] = "unpublished extension (URL source)";
    SourceOrigin["OFFICIAL_EXTENSION_VERSION"] = "specific version of an official extension";
})(SourceOrigin = exports.SourceOrigin || (exports.SourceOrigin = {}));
exports.logPrefix = "extensions";
const VALID_LICENSES = ["apache-2.0"];
// Extension archive URLs must be HTTPS.
exports.URL_REGEX = /^https:/;
exports.EXTENSIONS_BUCKET_NAME = (0, utils_1.envOverride)("FIREBASE_EXTENSIONS_UPLOAD_BUCKET", "firebase-ext-eap-uploads");
const AUTOPOPULATED_PARAM_NAMES = [
    "PROJECT_ID",
    "STORAGE_BUCKET",
    "EXT_INSTANCE_ID",
    "DATABASE_INSTANCE",
    "DATABASE_URL",
];
// Placeholders that can be used whever param substitution is needed, but are not available.
exports.AUTOPOPULATED_PARAM_PLACEHOLDERS = {
    PROJECT_ID: "project-id",
    STORAGE_BUCKET: "project-id.appspot.com",
    EXT_INSTANCE_ID: "extension-id",
    DATABASE_INSTANCE: "project-id-default-rtdb",
    DATABASE_URL: "https://project-id-default-rtdb.firebaseio.com",
};
exports.resourceTypeToNiceName = {
    "firebaseextensions.v1beta.function": "Cloud Function",
};
const repoRegex = new RegExp(`^https:\/\/github\.com\/[^\/]+\/[^\/]+$`);
const stageOptions = ["rc", "alpha", "beta", "stable"];
/**
 * Turns database URLs (e.g. https://my-db.firebaseio.com) into database instance names
 * (e.g. my-db), which can be used in a function trigger.
 * @param databaseUrl Fully qualified realtime database URL
 */
function getDBInstanceFromURL(databaseUrl = "") {
    const instanceRegex = new RegExp("(?:https://)(.*)(?:.firebaseio.com)");
    const matches = instanceRegex.exec(databaseUrl);
    if (matches && matches.length > 1) {
        return matches[1];
    }
    return "";
}
exports.getDBInstanceFromURL = getDBInstanceFromURL;
/**
 * Gets Firebase project specific param values.
 */
async function getFirebaseProjectParams(projectId, emulatorMode = false) {
    if (!projectId) {
        return {};
    }
    const body = emulatorMode
        ? await (0, adminSdkConfig_1.getProjectAdminSdkConfigOrCached)(projectId)
        : await (0, functionsConfig_1.getFirebaseConfig)({ project: projectId });
    let projectNumber = constants_1.Constants.FAKE_PROJECT_NUMBER;
    if (!constants_1.Constants.isDemoProject(projectId)) {
        try {
            projectNumber = await (0, getProjectNumber_1.getProjectNumber)({ projectId });
        }
        catch (err) {
            (0, utils_1.logLabeledError)("extensions", `Unable to look up project number for ${projectId}.\n` +
                " If this is a real project, ensure that you are logged in and have access to it.\n" +
                " If this is a fake project, please use a project ID starting with 'demo-' to skip production calls.\n" +
                " Continuing with a fake project number - secrets and other features that require production access may behave unexpectedly.");
        }
    }
    const databaseURL = body?.databaseURL ?? `https://${projectId}.firebaseio.com`;
    const storageBucket = body?.storageBucket ?? `${projectId}.appspot.com`;
    // This env variable is needed for parameter-less initialization of firebase-admin
    const FIREBASE_CONFIG = JSON.stringify({
        projectId,
        databaseURL,
        storageBucket,
    });
    return {
        PROJECT_ID: projectId,
        PROJECT_NUMBER: projectNumber,
        DATABASE_URL: databaseURL,
        STORAGE_BUCKET: storageBucket,
        FIREBASE_CONFIG,
        DATABASE_INSTANCE: getDBInstanceFromURL(databaseURL),
    };
}
exports.getFirebaseProjectParams = getFirebaseProjectParams;
/**
 * This function substitutes params used in the extension spec with values.
 * (e.g If the original object contains `path/${FOO}` or `path/${param:FOO}` and the param FOO has the value of "bar",
 * then it will become `path/bar`)
 * @param original Object containing strings that have placeholders that look like`${}`
 * @param params params to substitute the placeholders for
 * @return Resources object with substituted params
 */
function substituteParams(original, params) {
    const startingString = JSON.stringify(original);
    const applySubstitution = (str, paramVal, paramKey) => {
        const exp1 = new RegExp("\\$\\{" + paramKey + "\\}", "g");
        const exp2 = new RegExp("\\$\\{param:" + paramKey + "\\}", "g");
        const regexes = [exp1, exp2];
        const substituteRegexMatches = (unsubstituted, regex) => {
            return unsubstituted.replace(regex, paramVal);
        };
        return regexes.reduce(substituteRegexMatches, str);
    };
    const s = Object.entries(params).reduce((str, [key, val]) => applySubstitution(str, val, key), startingString);
    return JSON.parse(s);
}
exports.substituteParams = substituteParams;
/**
 * Substitutes any secret parameters with the correct format
 * @param projectNumber The project number we are installing into
 * @param params the full list of params to check for substitution.
 * @returns The substituted list of params
 */
async function substituteSecretParams(projectNumber, params) {
    const newParams = {};
    for await (const [key, value] of Object.entries(params)) {
        if (typeof value !== "string") {
            newParams[key] =
                `projects/${projectNumber}/secrets/${value.name}/versions/latest`;
        }
        else {
            newParams[key] = value;
        }
    }
    return newParams;
}
exports.substituteSecretParams = substituteSecretParams;
/**
 * Sets params equal to defaults given in extension.yaml if not already set in .env file.
 * @param paramVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 * @return JSON object of params
 */
function populateDefaultParams(paramVars, paramSpecs) {
    const newParams = paramVars;
    for (const param of paramSpecs) {
        if (!paramVars[param.param]) {
            if (param.default !== undefined && param.required) {
                newParams[param.param] = param.default;
            }
            else if (param.required) {
                throw new error_1.FirebaseError(`${param.param} has not been set in the given params file` +
                    " and there is no default available. Please set this variable before installing again.");
            }
        }
    }
    return newParams;
}
exports.populateDefaultParams = populateDefaultParams;
/**
 * Validates command-line params supplied by developer.
 * @param envVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 */
function validateCommandLineParams(envVars, paramSpec) {
    const paramNames = paramSpec.map((p) => p.param);
    const misnamedParams = Object.keys(envVars).filter((key) => {
        return !paramNames.includes(key) && !AUTOPOPULATED_PARAM_NAMES.includes(key);
    });
    if (misnamedParams.length) {
        logger_1.logger.warn("Warning: The following params were specified in your env file but do not exist in the extension spec: " +
            `${misnamedParams.join(", ")}.`);
    }
    let allParamsValid = true;
    for (const param of paramSpec) {
        // Warns if invalid response was found in environment file.
        if (!(0, askUserForParam_1.checkResponse)(envVars[param.param], param)) {
            allParamsValid = false;
        }
    }
    if (!allParamsValid) {
        throw new error_1.FirebaseError(`Some param values are not valid. Please check your params file.`);
    }
}
exports.validateCommandLineParams = validateCommandLineParams;
/**
 * Validates an Extension.yaml by checking that all required fields are present
 * and checking that invalid combinations of fields are not present.
 * @param spec An extension.yaml to validate.
 */
function validateSpec(spec) {
    const errors = [];
    if (!spec.name) {
        errors.push("extension.yaml is missing required field: name");
    }
    if (!spec.specVersion) {
        errors.push("extension.yaml is missing required field: specVersion");
    }
    if (!spec.version) {
        errors.push("extension.yaml is missing required field: version");
    }
    else if (!semver.valid(spec.version)) {
        errors.push(`version ${spec.version} in extension.yaml is not a valid semver`);
    }
    else {
        const version = semver.parse(spec.version);
        if (version.prerelease.length > 0 || version.build.length > 0) {
            errors.push("version field in extension.yaml does not support pre-release annotations; instead, set a pre-release stage using the --stage flag");
        }
    }
    if (!spec.license) {
        errors.push("extension.yaml is missing required field: license");
    }
    else {
        const formattedLicense = String(spec.license).toLocaleLowerCase();
        if (!VALID_LICENSES.includes(formattedLicense)) {
            errors.push(`license field in extension.yaml is invalid. Valid value(s): ${VALID_LICENSES.join(", ")}`);
        }
    }
    if (!spec.resources) {
        errors.push("Resources field must contain at least one resource");
    }
    else {
        for (const resource of spec.resources) {
            if (!resource.name) {
                errors.push("Resource is missing required field: name");
            }
            if (!resource.type) {
                errors.push(`Resource${resource.name ? ` ${resource.name}` : ""} is missing required field: type`);
            }
        }
    }
    for (const api of spec.apis || []) {
        if (!api.apiName) {
            errors.push("API is missing required field: apiName");
        }
    }
    for (const role of spec.roles || []) {
        if (!role.role) {
            errors.push("Role is missing required field: role");
        }
    }
    for (const param of spec.params || []) {
        if (!param.param) {
            errors.push("Param is missing required field: param");
        }
        if (!param.label) {
            errors.push(`Param${param.param ? ` ${param.param}` : ""} is missing required field: label`);
        }
        if (param.type && !Object.values(SpecParamType).includes(param.type)) {
            errors.push(`Invalid type ${param.type} for param${param.param ? ` ${param.param}` : ""}. Valid types are ${Object.values(SpecParamType).join(", ")}`);
        }
        if (!param.type || param.type === SpecParamType.STRING) {
            // ParamType defaults to STRING
            if (param.options) {
                errors.push(`Param${param.param ? ` ${param.param}` : ""} cannot have options because it is type STRING`);
            }
        }
        if (param.type &&
            (param.type === SpecParamType.SELECT || param.type === SpecParamType.MULTISELECT)) {
            if (param.validationRegex) {
                errors.push(`Param${param.param ? ` ${param.param}` : ""} cannot have validationRegex because it is type ${param.type}`);
            }
            if (!param.options) {
                errors.push(`Param${param.param ? ` ${param.param}` : ""} requires options because it is type ${param.type}`);
            }
            for (const opt of param.options || []) {
                if (opt.value === undefined) {
                    errors.push(`Option for param${param.param ? ` ${param.param}` : ""} is missing required field: value`);
                }
            }
        }
        if (param.type && param.type === SpecParamType.SELECTRESOURCE) {
            if (!param.resourceType) {
                errors.push(`Param${param.param ? ` ${param.param}` : ""} must have resourceType because it is type ${param.type}`);
            }
        }
    }
    if (errors.length) {
        const formatted = errors.map((error) => `  - ${error}`);
        const message = `The extension.yaml has the following errors: \n${formatted.join("\n")}`;
        throw new error_1.FirebaseError(message);
    }
}
exports.validateSpec = validateSpec;
/**
 * @param instanceId ID of the extension instance
 */
async function promptForValidInstanceId(instanceId) {
    let instanceIdIsValid = false;
    let newInstanceId = "";
    const instanceIdRegex = /^[a-z][a-z\d\-]*[a-z\d]$/;
    while (!instanceIdIsValid) {
        newInstanceId = await (0, prompt_1.input)({
            default: instanceId,
            message: `Please enter a new name for this instance:`,
        });
        if (newInstanceId.length <= 6 || 45 <= newInstanceId.length) {
            logger_1.logger.info("Invalid instance ID. Instance ID must be between 6 and 45 characters.");
        }
        else if (!instanceIdRegex.test(newInstanceId)) {
            logger_1.logger.info("Invalid instance ID. Instance ID must start with a lowercase letter, " +
                "end with a lowercase letter or number, and only contain lowercase letters, numbers, or -");
        }
        else {
            instanceIdIsValid = true;
        }
    }
    return newInstanceId;
}
exports.promptForValidInstanceId = promptForValidInstanceId;
/**
 * Prompts for a valid repo URI.
 */
async function promptForValidRepoURI() {
    let repoIsValid = false;
    let extensionRoot = "";
    while (!repoIsValid) {
        extensionRoot = await (0, prompt_1.input)("Enter the GitHub repo URI where this extension's source code is located:");
        if (!repoRegex.test(extensionRoot)) {
            logger_1.logger.info("Repo URI must follow this format: https://github.com/<user>/<repo>");
        }
        else {
            repoIsValid = true;
        }
    }
    return extensionRoot;
}
exports.promptForValidRepoURI = promptForValidRepoURI;
/**
 * Prompts for an extension root.
 *
 * @param defaultRoot the default extension root
 */
async function promptForExtensionRoot(defaultRoot) {
    return await (0, prompt_1.input)({
        message: "Enter this extension's root directory in the repo (defaults to previous root if set):",
        default: defaultRoot,
    });
}
exports.promptForExtensionRoot = promptForExtensionRoot;
/**
 * Prompts for the extension version's release stage.
 *
 * @param args.versionByStage map from stage to the next version to upload
 * @param args.autoReview whether the stable version will be automatically sent for review on upload
 * @param args.allowStable whether to allow stable versions
 * @param args.hasVersions whether there have been any pre-release versions uploaded already
 * @param args.nonInteractive whether the prompt is interactive or not
 * @param args.force whether to assume the default instead of asking the user
 */
async function promptForReleaseStage(args) {
    let stage = "rc";
    if (!args.nonInteractive) {
        const choices = [
            { name: `Release candidate (${args.versionByStage.get("rc")})`, value: "rc" },
            { name: `Alpha (${args.versionByStage.get("alpha")})`, value: "alpha" },
            { name: `Beta (${args.versionByStage.get("beta")})`, value: "beta" },
        ];
        if (args.allowStable) {
            const stableChoice = {
                name: `Stable (${args.versionByStage.get("stable")}${args.autoReview ? ", automatically sent for review" : ""})`,
                value: "stable",
            };
            choices.push(stableChoice);
        }
        stage = await (0, prompt_1.select)({
            message: "Choose the release stage:",
            choices: choices,
            default: stage,
        });
        if (stage === "stable" && !args.hasVersions) {
            const confirmed = await (0, prompt_1.confirm)({
                message: `${clc.bold(clc.yellow("Warning:"))} It's highly recommended to first upload a pre-release version before choosing stable.`,
                nonInteractive: args.nonInteractive,
                force: args.force,
                default: false,
            });
            if (!confirmed) {
                stage = await (0, prompt_1.select)({
                    message: "Choose the release stage:",
                    choices: choices,
                    default: stage,
                });
            }
        }
    }
    return stage;
}
async function checkExtensionsApiEnabled(options) {
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return false;
    }
    return await (0, ensureApiEnabled_1.check)(projectId, (0, api_1.extensionsOrigin)(), "extensions", options.markdown);
}
exports.checkExtensionsApiEnabled = checkExtensionsApiEnabled;
async function ensureExtensionsApiEnabled(options) {
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return;
    }
    return await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.extensionsOrigin)(), "extensions", options.markdown);
}
exports.ensureExtensionsApiEnabled = ensureExtensionsApiEnabled;
async function ensureExtensionsPublisherApiEnabled(options) {
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return;
    }
    return await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.extensionsPublisherOrigin)(), "extensions", options.markdown);
}
exports.ensureExtensionsPublisherApiEnabled = ensureExtensionsPublisherApiEnabled;
/**
 * Zips and uploads a local extension to a bucket.
 * @param extPath a local path to archive and upload
 * @param bucketName the bucket to upload to
 * @return the path where the source was uploaded to
 */
async function archiveAndUploadSource(extPath, bucketName) {
    const zippedSource = await (0, archiveDirectory_1.archiveDirectory)(extPath, {
        type: "zip",
        ignore: ["node_modules", ".git"],
    });
    const res = await (0, storage_1.uploadObject)(zippedSource, bucketName);
    return `/${res.bucket}/${res.object}`;
}
/**
 * Gets a list of the next version to upload by release stage.
 *
 * @param extensionRef the ref of the extension
 * @param version the new version of the extension
 */
async function getNextVersionByStage(extensionRef, newVersion) {
    let extensionVersions = [];
    try {
        extensionVersions = await (0, publisherApi_1.listExtensionVersions)(extensionRef, `id="${newVersion}"`, true);
    }
    catch (err) {
        // Silently fail if no extension versions exist.
    }
    // Maps stage to default next version (e.g. "rc" => "1.0.0-rc.0").
    const versionByStage = new Map(["rc", "alpha", "beta"].map((stage) => [
        stage,
        semver.inc(`${newVersion}-${stage}`, "prerelease", undefined, stage),
    ]));
    for (const extensionVersion of extensionVersions) {
        const version = semver.parse(extensionVersion.spec.version);
        if (!version.prerelease.length) {
            continue;
        }
        // Extensions only support a single prerelease annotation.
        const prerelease = semver.prerelease(version)[0];
        // Parse out stage from prerelease (e.g. "rc" from "rc.0").
        const stage = prerelease.split(".")[0];
        if (versionByStage.has(stage) && semver.gte(version, versionByStage.get(stage))) {
            versionByStage.set(stage, semver.inc(version, "prerelease", undefined, stage));
        }
    }
    versionByStage.set("stable", newVersion);
    return { versionByStage, hasVersions: extensionVersions.length > 0 };
}
exports.getNextVersionByStage = getNextVersionByStage;
/**
 * Validates the extension spec.
 *
 * @param rootDirectory the directory with the extension source
 * @param extensionRef the ref of the extension
 */
async function validateExtensionSpec(rootDirectory, extensionId) {
    const extensionSpec = await (0, localHelper_1.getLocalExtensionSpec)(rootDirectory);
    if (extensionSpec.name !== extensionId) {
        throw new error_1.FirebaseError(`Extension ID '${clc.bold(extensionId)}' does not match the name in extension.yaml '${clc.bold(extensionSpec.name)}'.`);
    }
    // Substitute deepcopied spec with autopopulated params, and make sure that it passes basic extension.yaml validation.
    const subbedSpec = JSON.parse(JSON.stringify(extensionSpec));
    subbedSpec.params = substituteParams(extensionSpec.params || [], exports.AUTOPOPULATED_PARAM_PLACEHOLDERS);
    validateSpec(subbedSpec);
    return extensionSpec;
}
/**
 * Validates the release notes.
 *
 * @param rootDirectory the directory with the extension source
 * @param newVersion the new extension version
 */
function validateReleaseNotes(rootDirectory, newVersion, extension) {
    let notes;
    try {
        const changes = (0, change_log_1.getLocalChangelog)(rootDirectory);
        notes = changes[newVersion];
    }
    catch (err) {
        throw new error_1.FirebaseError("No CHANGELOG.md file found. " +
            "Please create one and add an entry for this version. " +
            "See https://firebase.google.com/docs/extensions/publishers/user-documentation#writing-changelog for more details.");
    }
    // Notes are required for all stable versions after the initial release.
    if (!notes && !semver.prerelease(newVersion) && extension) {
        throw new error_1.FirebaseError(`No entry for version ${newVersion} found in CHANGELOG.md. ` +
            "Please add one so users know what has changed in this version. " +
            "See https://firebase.google.com/docs/extensions/publishers/user-documentation#writing-changelog for more details.");
    }
    return notes;
}
/**
 * Validates the extension version.
 *
 * @param extensionRef the ref of the extension
 * @param newVersion the new extension version
 * @param latestVersion the latest extension version
 */
function validateVersion(extensionRef, newVersion, latestVersion) {
    if (latestVersion) {
        if (semver.lt(newVersion, latestVersion)) {
            throw new error_1.FirebaseError(`The version you are trying to publish (${clc.bold(newVersion)}) is lower than the current version (${clc.bold(latestVersion)}) for the extension '${clc.bold(extensionRef)}'. Make sure this version is greater than the current version (${clc.bold(latestVersion)}) inside of extension.yaml and try again.\n`, { exit: 104 });
        }
        else if (semver.eq(newVersion, latestVersion)) {
            throw new error_1.FirebaseError(`The version you are trying to upload (${clc.bold(newVersion)}) already exists for extension '${clc.bold(extensionRef)}'. Increment the version inside of extension.yaml and try again.\n`, { exit: 103 });
        }
    }
}
/** Unpacks extension state into a more specific string. */
function unpackExtensionState(extension) {
    switch (extension.state) {
        case "PUBLISHED":
            // Unpacking legacy "published" terminology.
            if (extension.latestApprovedVersion) {
                return clc.bold(clc.green("Published"));
            }
            else if (extension.latestVersion) {
                return clc.green("Uploaded");
            }
            else {
                return "Prerelease";
            }
        case "DEPRECATED":
            return clc.red("Deprecated");
        case "SUSPENDED":
            return clc.bold(clc.red("Suspended"));
        default:
            return "-";
    }
}
exports.unpackExtensionState = unpackExtensionState;
/**
 * Displays metadata about the extension being uploaded.
 * @param extensionRef the ref of the extension
 */
function displayExtensionHeader(extensionRef, extension, extensionRoot) {
    if (extension) {
        let source = "Local source";
        if (extension.repoUri) {
            const uri = new URL(extension.repoUri);
            uri.pathname = path.join(uri.pathname, extensionRoot ?? "");
            source = `${uri.toString()} (use --repo and --root to modify)`;
        }
        logger_1.logger.info(`\n${clc.bold("Extension:")} ${extension.ref}\n` +
            `${clc.bold("State:")} ${unpackExtensionState(extension)}\n` +
            `${clc.bold("Latest Version:")} ${extension.latestVersion ?? "-"}\n` +
            `${clc.bold("Version in Extensions Hub:")} ${extension.latestApprovedVersion ?? "-"}\n` +
            `${clc.bold("Source in GitHub:")} ${source}\n`);
    }
    else {
        logger_1.logger.info(`\n${clc.bold("Extension:")} ${extensionRef}\n` +
            `${clc.bold("State:")} ${clc.bold(clc.blueBright("New"))}\n`);
    }
}
/**
 * Fetches the extension source from GitHub.
 * @param repoUri the public GitHub repo URI that contains the extension source
 * @param sourceRef the commit hash, branch, or tag to build from the repo
 * @param extensionRoot the root directory that contains this extension
 */
async function fetchExtensionSource(repoUri, sourceRef, extensionRoot) {
    const sourceUri = repoUri + path.join("/tree", sourceRef, extensionRoot);
    logger_1.logger.info(`Validating source code at ${clc.bold(sourceUri)}...`);
    const archiveUri = `${repoUri}/archive/${sourceRef}.zip`;
    const tempDirectory = tmp.dirSync({ unsafeCleanup: true });
    const archiveErrorMessage = `Failed to extract archive from ${clc.bold(archiveUri)}. Please check that the repo is public and that the source ref is valid.`;
    try {
        const response = await (0, node_fetch_1.default)(archiveUri);
        if (response.ok) {
            await response.body.pipe((0, unzip_1.createUnzipTransform)(tempDirectory.name)).promise();
        }
    }
    catch (err) {
        throw new error_1.FirebaseError(archiveErrorMessage);
    }
    const archiveName = fs.readdirSync(tempDirectory.name)[0];
    if (!archiveName) {
        throw new error_1.FirebaseError(archiveErrorMessage);
    }
    const rootDirectory = path.join(tempDirectory.name, archiveName, extensionRoot);
    // Pre-validation to show a more useful error message in the context of a temp directory.
    try {
        (0, localHelper_1.readFile)(path.resolve(rootDirectory, localHelper_1.EXTENSIONS_SPEC_FILE));
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to find ${clc.bold(localHelper_1.EXTENSIONS_SPEC_FILE)} in directory ${clc.bold(extensionRoot)}. Please verify the root and try again.`);
    }
    return rootDirectory;
}
/**
 * Uploads an extension version from a GitHub repo.
 * @param args.publisherId the ID of the Publisher this Extension will be published under
 * @param args.extensionId the ID of the Extension to be published
 * @param args.repoUri the URI of the repo where this Extension's source exists
 * @param args.sourceRef the commit hash, branch, or tag name in the repo to publish from
 * @param args.extensionRoot the root directory that contains this Extension's source
 * @param args.stage the release stage to publish
 * @param args.nonInteractive whether to display prompts
 * @param args.force whether to force confirmations
 */
async function uploadExtensionVersionFromGitHubSource(args) {
    const extensionRef = `${args.publisherId}/${args.extensionId}`;
    let extension;
    let latestVersion;
    try {
        extension = await (0, publisherApi_1.getExtension)(extensionRef);
        latestVersion = await (0, publisherApi_1.getExtensionVersion)(`${extensionRef}@latest`);
    }
    catch (err) {
        // Silently fail and continue if extension is new or has no latest version set.
    }
    displayExtensionHeader(extensionRef, extension, latestVersion?.extensionRoot);
    if (args.stage && !stageOptions.includes(args.stage)) {
        throw new error_1.FirebaseError(`--stage only supports the following values: ${stageOptions.join(", ")}`);
    }
    // Prompt for repo URI.
    if (args.repoUri && !repoRegex.test(args.repoUri)) {
        throw new error_1.FirebaseError("Repo URI must follow this format: https://github.com/<user>/<repo>");
    }
    let repoUri = args.repoUri || extension?.repoUri;
    if (!repoUri) {
        if (!args.nonInteractive) {
            repoUri = await promptForValidRepoURI();
        }
        else {
            throw new error_1.FirebaseError("Repo URI is required but not currently set.");
        }
    }
    let extensionRoot = args.extensionRoot || latestVersion?.extensionRoot;
    if (!extensionRoot) {
        const defaultRoot = "/";
        if (!args.nonInteractive) {
            extensionRoot = await promptForExtensionRoot(defaultRoot);
        }
        else {
            extensionRoot = defaultRoot;
        }
    }
    // Normalize root path and strip leading and trailing slashes and all `../`.
    const normalizedRoot = path
        .normalize(extensionRoot)
        .replaceAll(/^\/|\/$/g, "")
        .replaceAll(/^(\.\.\/)*/g, "");
    extensionRoot = normalizedRoot || "/";
    // Prompt for source ref and default to HEAD.
    let sourceRef = args.sourceRef;
    const defaultSourceRef = "HEAD";
    if (!sourceRef) {
        if (!args.nonInteractive) {
            sourceRef = await (0, prompt_1.input)({
                message: "Enter the commit hash, branch, or tag name to build from in the repo:",
                default: defaultSourceRef,
            });
        }
        else {
            sourceRef = defaultSourceRef;
        }
    }
    const rootDirectory = await fetchExtensionSource(repoUri, sourceRef, extensionRoot);
    const extensionSpec = await validateExtensionSpec(rootDirectory, args.extensionId);
    validateVersion(extensionRef, extensionSpec.version, extension?.latestVersion);
    const { versionByStage, hasVersions } = await getNextVersionByStage(extensionRef, extensionSpec.version);
    const autoReview = !!extension?.latestApprovedVersion ||
        latestVersion?.listing?.state === "PENDING" ||
        latestVersion?.listing?.state === "APPROVED" ||
        latestVersion?.listing?.state === "REJECTED";
    // Prompt for release stage.
    let stage = args.stage;
    if (!stage) {
        stage = await promptForReleaseStage({
            versionByStage,
            autoReview,
            allowStable: true,
            hasVersions,
            nonInteractive: args.nonInteractive,
            force: args.force,
        });
    }
    const newVersion = versionByStage.get(stage);
    const releaseNotes = validateReleaseNotes(rootDirectory, extensionSpec.version, extension);
    const sourceUri = repoUri + path.join("/tree", sourceRef, extensionRoot);
    displayReleaseNotes({
        extensionRef,
        newVersion,
        releaseNotes,
        sourceUri,
        autoReview: stage === "stable" && autoReview,
    });
    const confirmed = await (0, prompt_1.confirm)({
        message: "Continue?",
        nonInteractive: args.nonInteractive,
        force: args.force,
        default: false,
    });
    if (!confirmed) {
        return;
    }
    // Upload the extension version.
    const extensionVersionRef = `${extensionRef}@${newVersion}`;
    const uploadSpinner = ora(`Uploading ${clc.bold(extensionVersionRef)}...`);
    let res;
    try {
        uploadSpinner.start();
        res = await (0, publisherApi_1.createExtensionVersionFromGitHubSource)({
            extensionVersionRef,
            extensionRoot,
            repoUri,
            sourceRef: sourceRef,
        });
        uploadSpinner.succeed(`Successfully uploaded ${clc.bold(extensionRef)}`);
    }
    catch (err) {
        uploadSpinner.fail();
        if (err.status === 404) {
            throw getMissingPublisherError(args.publisherId);
        }
        throw err;
    }
    return res;
}
exports.uploadExtensionVersionFromGitHubSource = uploadExtensionVersionFromGitHubSource;
/**
 * Uploads an extension version from local source.
 * @param args.publisherId the ID of the Publisher this Extension will be published under
 * @param args.extensionId the ID of the Extension to be published
 * @param args.rootDirectory the root directory that contains this Extension's source
 * @param args.stage the release stage to publish
 * @param args.nonInteractive whether to display prompts
 * @param args.force whether to force confirmations
 */
async function uploadExtensionVersionFromLocalSource(args) {
    const extensionRef = `${args.publisherId}/${args.extensionId}`;
    let extension;
    let latestVersion;
    try {
        extension = await (0, publisherApi_1.getExtension)(extensionRef);
        latestVersion = await (0, publisherApi_1.getExtensionVersion)(`${extensionRef}@latest`);
    }
    catch (err) {
        // Silently fail and continue if extension is new or has no latest version set.
    }
    displayExtensionHeader(extensionRef, extension, latestVersion?.extensionRoot);
    const localStageOptions = ["rc", "alpha", "beta"];
    if (args.stage && !localStageOptions.includes(args.stage)) {
        throw new error_1.FirebaseError(`--stage only supports the following values when used with --local: ${localStageOptions.join(", ")}`);
    }
    const extensionSpec = await validateExtensionSpec(args.rootDirectory, args.extensionId);
    validateVersion(extensionRef, extensionSpec.version, extension?.latestVersion);
    const { versionByStage } = await getNextVersionByStage(extensionRef, extensionSpec.version);
    // Prompt for release stage.
    let stage = args.stage;
    if (!stage) {
        if (!args.nonInteractive) {
            stage = await promptForReleaseStage({
                versionByStage,
                autoReview: false,
                allowStable: false,
                hasVersions: false,
                nonInteractive: args.nonInteractive,
                force: args.force,
            });
        }
        else {
            stage = "rc";
        }
    }
    const newVersion = versionByStage.get(stage);
    const releaseNotes = validateReleaseNotes(args.rootDirectory, extensionSpec.version, extension);
    displayReleaseNotes({ extensionRef, newVersion, releaseNotes, autoReview: false });
    const confirmed = await (0, prompt_1.confirm)({
        message: "Continue?",
        nonInteractive: args.nonInteractive,
        force: args.force,
        default: false,
    });
    if (!confirmed) {
        return;
    }
    const extensionVersionRef = `${extensionRef}@${newVersion}`;
    let packageUri;
    let objectPath = "";
    const uploadSpinner = ora("Archiving and uploading extension source code...");
    try {
        uploadSpinner.start();
        objectPath = await archiveAndUploadSource(args.rootDirectory, exports.EXTENSIONS_BUCKET_NAME);
        uploadSpinner.succeed("Uploaded extension source code");
        packageUri = (0, api_1.storageOrigin)() + objectPath + "?alt=media";
    }
    catch (err) {
        uploadSpinner.fail();
        throw new error_1.FirebaseError(`Failed to archive and upload extension source code, ${err}`, {
            original: err,
        });
    }
    const publishSpinner = ora(`Uploading ${clc.bold(extensionVersionRef)}...`);
    let res;
    try {
        publishSpinner.start();
        res = await (0, publisherApi_1.createExtensionVersionFromLocalSource)({ extensionVersionRef, packageUri });
        publishSpinner.succeed(`Successfully uploaded ${clc.bold(extensionVersionRef)}`);
    }
    catch (err) {
        publishSpinner.fail();
        if (err.status === 404) {
            throw getMissingPublisherError(args.publisherId);
        }
        throw err;
    }
    await deleteUploadedSource(objectPath);
    return res;
}
exports.uploadExtensionVersionFromLocalSource = uploadExtensionVersionFromLocalSource;
function getMissingPublisherError(publisherId) {
    return new error_1.FirebaseError(`Couldn't find publisher ID '${clc.bold(publisherId)}'. Please ensure that you have registered this ID. For step-by-step instructions on getting started as a publisher, see https://firebase.google.com/docs/extensions/publishers/get-started.`);
}
exports.getMissingPublisherError = getMissingPublisherError;
/**
 * Creates a source from a local path or URL. If a local path is given, it will be zipped
 * and uploaded to EXTENSIONS_BUCKET_NAME, and then deleted after the source is created.
 * @param projectId the project to create the source in
 * @param sourceUri a local path containing an extension or a URL pointing at a zipped extension
 */
async function createSourceFromLocation(projectId, sourceUri) {
    const extensionRoot = "/";
    let packageUri;
    let objectPath = "";
    const spinner = ora(" Archiving and uploading extension source code");
    try {
        spinner.start();
        objectPath = await archiveAndUploadSource(sourceUri, exports.EXTENSIONS_BUCKET_NAME);
        spinner.succeed(" Uploaded extension source code");
        packageUri = (0, api_1.storageOrigin)() + objectPath + "?alt=media";
        const res = await (0, extensionsApi_1.createSource)(projectId, packageUri, extensionRoot);
        logger_1.logger.debug("Created new Extension Source %s", res.name);
        // if we uploaded an object to user's bucket, delete it after "createSource" copies it into extension service's bucket.
        await deleteUploadedSource(objectPath);
        return res;
    }
    catch (err) {
        spinner.fail();
        throw new error_1.FirebaseError(`Failed to archive and upload extension source from ${sourceUri}, ${err}`, {
            original: err,
        });
    }
}
exports.createSourceFromLocation = createSourceFromLocation;
/**
 * Cleans up uploaded ZIP file after creating an extension source or publishing an extension version.
 */
async function deleteUploadedSource(objectPath) {
    if (objectPath.length) {
        try {
            await (0, storage_1.deleteObject)(objectPath);
            logger_1.logger.debug("Cleaned up uploaded source archive");
        }
        catch (err) {
            logger_1.logger.debug("Unable to clean up uploaded source archive");
        }
    }
}
/**
 * Parses the publisher project number from publisher profile name.
 */
function getPublisherProjectFromName(publisherName) {
    const publisherNameRegex = /projects\/.+\/publisherProfile/;
    if (publisherNameRegex.test(publisherName)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, projectNumber, __] = publisherName.split("/");
        return Number.parseInt(projectNumber);
    }
    throw new error_1.FirebaseError(`Could not find publisher with name '${publisherName}'.`);
}
exports.getPublisherProjectFromName = getPublisherProjectFromName;
/**
 * Displays the release notes and confirmation message for the extension to be uploaded.
 * @param args.extensionRef the ref of the extension
 * @param args.newVersion the new version of the extension
 * @param args.autoReview the autoreview
 * @param args.releaseNotes the release notes for the version being uploaded (if any)
 * @param args.sourceUri the source URI from which the extension will be uploaded
 */
function displayReleaseNotes(args) {
    const source = args.sourceUri || "Local source";
    const releaseNotesMessage = args.releaseNotes
        ? `${clc.bold("Release notes:")}\n${(0, marked_1.marked)(args.releaseNotes)}`
        : "\n";
    const metadataMessage = `${clc.bold("Extension:")} ${args.extensionRef}\n` +
        `${clc.bold("Version:")} ${clc.bold(clc.green(args.newVersion))} ${args.autoReview ? "(automatically sent for review)" : ""}\n` +
        `${clc.bold("Source:")} ${source}\n`;
    const message = `\nYou are about to upload a new version to Firebase's registry of extensions.\n\n` +
        metadataMessage +
        releaseNotesMessage +
        `Once an extension version is uploaded, it becomes installable by other users and cannot be changed. If you wish to make changes after uploading, you will need to upload a new version.\n`;
    logger_1.logger.info(message);
}
exports.displayReleaseNotes = displayReleaseNotes;
/**
 * Confirm if the user wants to install another instance of an extension when they already have one.
 * @param projectName The name of the project in use.
 * @param extensionName The name of the extension being installed.
 */
async function promptForRepeatInstance(projectName, extensionName) {
    const message = `An extension with the ID '${clc.bold(extensionName)}' already exists in the project '${clc.bold(projectName)}'. What would you like to do?`;
    return await (0, prompt_1.select)({
        message,
        choices: [
            { name: "Update or reconfigure the existing instance", value: "updateExisting" },
            { name: "Install a new instance with a different ID", value: "installNew" },
            { name: "Cancel extension installation", value: "cancel" },
        ],
    });
}
exports.promptForRepeatInstance = promptForRepeatInstance;
/**
 * Checks to see if an extension instance exists.
 * @param projectId ID of the project in use
 * @param instanceId ID of the extension instance
 */
async function instanceIdExists(projectId, instanceId) {
    try {
        await (0, extensionsApi_1.getInstance)(projectId, instanceId);
    }
    catch (err) {
        if (err instanceof error_1.FirebaseError) {
            if (err.status === 404) {
                return false;
            }
            const msg = `Unexpected error when checking if instance ID exists: ${err.message}`;
            throw new error_1.FirebaseError(msg, {
                original: err,
            });
        }
        else {
            throw err;
        }
    }
    return true;
}
exports.instanceIdExists = instanceIdExists;
function isUrlPath(extInstallPath) {
    return extInstallPath.startsWith("https:");
}
exports.isUrlPath = isUrlPath;
function isLocalPath(extInstallPath) {
    const trimmedPath = extInstallPath.trim();
    return (trimmedPath.startsWith(`~${path.sep}`) ||
        trimmedPath.startsWith(`.${path.sep}`) ||
        trimmedPath.startsWith(`..${path.sep}`) ||
        trimmedPath.startsWith(`${path.sep}`) ||
        // Windows generally supports both forward and back slashes (even though the path.sep is \, so always check)
        // https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats#canonicalize-separators
        trimmedPath.startsWith(`~/`) ||
        trimmedPath.startsWith(`./`) ||
        trimmedPath.startsWith(`../`) ||
        trimmedPath.startsWith(`/`) ||
        [".", ".."].includes(trimmedPath));
}
exports.isLocalPath = isLocalPath;
function isLocalOrURLPath(extInstallPath) {
    return isLocalPath(extInstallPath) || isUrlPath(extInstallPath);
}
exports.isLocalOrURLPath = isLocalOrURLPath;
/**
 * Given an update source, return where the update source came from.
 * @param sourceOrVersion path to a source or reference to a source version
 */
function getSourceOrigin(sourceOrVersion) {
    // First, check if the input matches a local or URL.
    if (isLocalPath(sourceOrVersion)) {
        return SourceOrigin.LOCAL;
    }
    if (isUrlPath(sourceOrVersion)) {
        return SourceOrigin.URL;
    }
    // Next, check if the source is an extension reference.
    if (sourceOrVersion.includes("/")) {
        let ref;
        try {
            ref = refs.parse(sourceOrVersion);
        }
        catch (err) {
            // Silently fail.
        }
        if (ref && ref.publisherId && ref.extensionId && !ref.version) {
            return SourceOrigin.PUBLISHED_EXTENSION;
        }
        else if (ref && ref.publisherId && ref.extensionId && ref.version) {
            return SourceOrigin.PUBLISHED_EXTENSION_VERSION;
        }
    }
    throw new error_1.FirebaseError(`Could not find source '${clc.bold(sourceOrVersion)}'. Check to make sure the source is correct, and then please try again.`);
}
exports.getSourceOrigin = getSourceOrigin;
async function diagnoseAndFixProject(options) {
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return;
    }
    const ok = await (0, diagnose_1.diagnose)(projectId);
    if (!ok) {
        throw new error_1.FirebaseError("Unable to proceed until all issues are resolved.");
    }
}
exports.diagnoseAndFixProject = diagnoseAndFixProject;
//# sourceMappingURL=extensionsHelper.js.map