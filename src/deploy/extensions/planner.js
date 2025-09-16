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
exports.resolveVersion = exports.want = exports.wantDynamic = exports.have = exports.haveDynamic = exports.getExtensionSpec = exports.getExtension = exports.getExtensionVersion = void 0;
const semver = __importStar(require("semver"));
const extensionsApi = __importStar(require("../../extensions/extensionsApi"));
const refs = __importStar(require("../../extensions/refs"));
const error_1 = require("../../error");
const extensionsHelper_1 = require("../../extensions/extensionsHelper");
const logger_1 = require("../../logger");
const manifest_1 = require("../../extensions/manifest");
const paramHelper_1 = require("../../extensions/paramHelper");
const specHelper_1 = require("../../extensions/emulator/specHelper");
const functional_1 = require("../../functional");
const askUserForEventsConfig_1 = require("../../extensions/askUserForEventsConfig");
/**
 * Caching fetcher for the corresponding ExtensionVersion for an instance spec.
 */
async function getExtensionVersion(i) {
    if (!i.extensionVersion) {
        if (!i.ref) {
            throw new error_1.FirebaseError(`Can't get ExtensionVersion for ${i.instanceId} because it has no ref`);
        }
        i.extensionVersion = await extensionsApi.getExtensionVersion(refs.toExtensionVersionRef(i.ref));
    }
    return i.extensionVersion;
}
exports.getExtensionVersion = getExtensionVersion;
/**
 * Caching fetcher for the corresponding Extension for an instance spec.
 */
async function getExtension(i) {
    if (!i.ref) {
        throw new error_1.FirebaseError(`Can't get Extension for ${i.instanceId} because it has no ref`);
    }
    if (!i.extension) {
        i.extension = await extensionsApi.getExtension(refs.toExtensionRef(i.ref));
    }
    return i.extension;
}
exports.getExtension = getExtension;
/**
 * Caching fetcher for the corresponding ExtensionSpec for an instance spec.
 * @param i The instance spec to get the extension spec for.
 * @return the extension spec for the instance spec.
 */
async function getExtensionSpec(i) {
    if (!i.extensionSpec) {
        if (i.ref) {
            const extensionVersion = await getExtensionVersion(i);
            i.extensionSpec = extensionVersion.spec;
        }
        else if (i.localPath) {
            i.extensionSpec = await (0, specHelper_1.readExtensionYaml)(i.localPath);
            i.extensionSpec.postinstallContent = await (0, specHelper_1.readPostinstall)(i.localPath);
        }
        else {
            throw new error_1.FirebaseError("InstanceSpec had no ref or localPath, unable to get extensionSpec");
        }
    }
    if (!i.extensionSpec) {
        throw new error_1.FirebaseError("Internal error getting extension");
    }
    return i.extensionSpec;
}
exports.getExtensionSpec = getExtensionSpec;
/**
 * haveDynamic checks a project for what extension instances created by SDK are
 * currently installed, and returns them as a list of instanceSpecs.
 * @param projectId The projectId we are getting a list of extensions for
 * @return a list of extensions deployed from functions deploy
 */
async function haveDynamic(projectId) {
    return (await extensionsApi.listInstances(projectId))
        .filter((i) => i.labels?.createdBy === "SDK")
        .map((i) => {
        const instanceId = i.name.split("/").pop();
        if (!instanceId) {
            throw new error_1.FirebaseError(`Internal error getting instanceId from ${i.name}`);
        }
        const dep = {
            instanceId,
            params: i.config.params,
            systemParams: i.config.systemParams ?? {},
            allowedEventTypes: i.config.allowedEventTypes,
            eventarcChannel: i.config.eventarcChannel,
            etag: i.etag,
            labels: i.labels,
        };
        if (i.config.extensionRef) {
            const ref = refs.parse(i.config.extensionRef);
            dep.ref = ref;
            dep.ref.version = i.config.extensionVersion;
        }
        return dep;
    });
}
exports.haveDynamic = haveDynamic;
/**
 * have checks a project for what extension instances created by console or CLI
 * are currently installed, and returns them as a list of instanceSpecs.
 * @param projectId The projectId we are getting a list of extensions for
 * @return a list extensions deployed from extensions deploy or console.
 */
async function have(projectId) {
    return (await extensionsApi.listInstances(projectId))
        .filter((i) => !(i.labels?.createdBy === "SDK"))
        .map((i) => {
        const instanceId = i.name.split("/").pop();
        if (!instanceId) {
            throw new error_1.FirebaseError(`Internal error getting instanceId from ${i.name}`);
        }
        const dep = {
            instanceId,
            params: i.config.params,
            systemParams: i.config.systemParams ?? {},
            allowedEventTypes: i.config.allowedEventTypes,
            eventarcChannel: i.config.eventarcChannel,
            etag: i.etag,
        };
        if (i.labels) {
            dep.labels = i.labels;
        }
        if (i.config.extensionRef) {
            const ref = refs.parse(i.config.extensionRef);
            dep.ref = ref;
            dep.ref.version = i.config.extensionVersion;
        }
        return dep;
    });
}
exports.have = have;
/**
 * wantDynamic checks the user's code for Extension SDKs usage and returns
 * any extensions the user has defined that way.
 * @param args The various args passed to wantDynamic
 * @param args.projectId The project we are deploying to
 * @param args.projectNumber The project number we are deploying to.
 * @param args.extensions The extensions section of firebase.json
 * @param args.emulatorMode Whether the output will be used by the Extensions emulator.
 */
async function wantDynamic(args) {
    const instanceSpecs = [];
    const errors = [];
    if (!args.extensions) {
        return [];
    }
    for (const [instanceId, ext] of Object.entries(args.extensions)) {
        const autoPopulatedParams = await (0, extensionsHelper_1.getFirebaseProjectParams)(args.projectId, args.emulatorMode);
        const subbedParams = (0, extensionsHelper_1.substituteParams)(ext.params, autoPopulatedParams);
        const eventarcChannel = ext.params["_EVENT_ARC_REGION"]
            ? (0, askUserForEventsConfig_1.getEventArcChannel)(args.projectId, ext.params["_EVENT_ARC_REGION"])
            : undefined;
        delete subbedParams["_EVENT_ARC_REGION"]; // neither system nor regular param
        const subbedSecretParams = await (0, extensionsHelper_1.substituteSecretParams)(args.projectNumber, subbedParams);
        const [systemParams, params] = (0, functional_1.partitionRecord)(subbedSecretParams, paramHelper_1.isSystemParam);
        const allowedEventTypes = ext.events.length ? ext.events : undefined;
        if (allowedEventTypes && !eventarcChannel) {
            errors.push(new error_1.FirebaseError("EventArcRegion must be specified if event handlers are defined"));
        }
        if (ext.localPath) {
            instanceSpecs.push({
                instanceId,
                localPath: ext.localPath,
                params,
                systemParams,
                allowedEventTypes,
                eventarcChannel,
                labels: ext.labels,
            });
        }
        else if (ext.ref) {
            instanceSpecs.push({
                instanceId,
                ref: refs.parse(ext.ref),
                params,
                systemParams,
                allowedEventTypes,
                eventarcChannel,
                labels: ext.labels,
            });
        }
    }
    if (errors.length) {
        const messages = errors.map((err) => `- ${err.message}`).join("\n");
        throw new error_1.FirebaseError(`Errors while reading 'extensions' in app code\n${messages}`);
    }
    return instanceSpecs;
}
exports.wantDynamic = wantDynamic;
/**
 * want checks firebase.json and the extensions directory for which extensions
 * the user wants installed on their project.
 * @param args The various args passed to want.
 * @param args.projectId The project we are deploying to
 * @param args.projectNumber The project number we are deploying to. Used for checking .env files.
 * @param args.aliases An array of aliases for the project we are deploying to. Used for checking .env files.
 * @param args.projectDir The directory containing firebase.json and extensions/
 * @param args.extensions The extensions section of firebase.jsonm
 * @param args.emulatorMode Whether the output will be used by the Extensions emulator.
 *                     If true, this will check {instanceId}.env.local for params and will respect `demo-` project rules.
 * @return an array of deployment instance specs to deploy.
 */
async function want(args) {
    const instanceSpecs = [];
    const errors = [];
    if (!args.extensions) {
        return [];
    }
    for (const e of Object.entries(args.extensions)) {
        try {
            const instanceId = e[0];
            const rawParams = (0, manifest_1.readInstanceParam)({
                projectDir: args.projectDir,
                instanceId,
                projectId: args.projectId,
                projectNumber: args.projectNumber,
                aliases: args.aliases,
                checkLocal: args.emulatorMode,
            });
            const autoPopulatedParams = await (0, extensionsHelper_1.getFirebaseProjectParams)(args.projectId, args.emulatorMode);
            const subbedParams = (0, extensionsHelper_1.substituteParams)(rawParams, autoPopulatedParams);
            const [systemParams, params] = (0, functional_1.partitionRecord)(subbedParams, paramHelper_1.isSystemParam);
            // ALLOWED_EVENT_TYPES can be undefined (user input not provided) or empty string (no events selected).
            // If empty string, we want to pass an empty array. If it's undefined we want to pass through undefined.
            const allowedEventTypes = params.ALLOWED_EVENT_TYPES !== undefined
                ? params.ALLOWED_EVENT_TYPES.split(",").filter((e) => e !== "")
                : undefined;
            const eventarcChannel = params.EVENTARC_CHANNEL;
            // Remove special params that are stored in the .env file but aren't actually params specified by the publisher.
            // Currently, only environment variables needed for Events features are considered special params stored in .env files.
            delete params["EVENTARC_CHANNEL"];
            delete params["ALLOWED_EVENT_TYPES"];
            if ((0, extensionsHelper_1.isLocalPath)(e[1])) {
                instanceSpecs.push({
                    instanceId,
                    localPath: e[1],
                    params,
                    systemParams,
                    allowedEventTypes: allowedEventTypes,
                    eventarcChannel: eventarcChannel,
                });
            }
            else {
                const ref = refs.parse(e[1]);
                ref.version = await resolveVersion(ref);
                instanceSpecs.push({
                    instanceId,
                    ref,
                    params,
                    systemParams,
                    allowedEventTypes: allowedEventTypes,
                    eventarcChannel: eventarcChannel,
                });
            }
        }
        catch (err) {
            logger_1.logger.debug(`Got error reading extensions entry ${e[0]} (${e[1]}): ${(0, error_1.getErrMsg)(err)}`);
            errors.push(err);
        }
    }
    if (errors.length) {
        const messages = errors.map((err) => `- ${err.message}`).join("\n");
        throw new error_1.FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`);
    }
    return instanceSpecs;
}
exports.want = want;
/**
 * Resolves a semver string to the max matching version. If no version is specified,
 * it will default to the extension's latest approved version if set, otherwise to the latest version.
 * @param ref the extension version ref
 * @param extension the extension (optional)
 */
async function resolveVersion(ref, extension) {
    const extensionRef = refs.toExtensionRef(ref);
    if (!ref.version && extension?.latestApprovedVersion) {
        return extension.latestApprovedVersion;
    }
    if (ref.version === "latest-approved") {
        if (!extension?.latestApprovedVersion) {
            throw new error_1.FirebaseError(`${extensionRef} has not been published to Extensions Hub (https://extensions.dev). To install it, you must specify the version you want to install.`);
        }
        return extension.latestApprovedVersion;
    }
    if (!ref.version || ref.version === "latest") {
        if (!extension?.latestVersion) {
            throw new error_1.FirebaseError(`${extensionRef} has no stable non-deprecated versions. If you wish to install a prerelease version, you must specify the version you want to install.`);
        }
        return extension.latestVersion;
    }
    const versions = await extensionsApi.listExtensionVersions(extensionRef, undefined, true);
    if (versions.length === 0) {
        throw new error_1.FirebaseError(`No versions found for ${extensionRef}`);
    }
    const maxSatisfying = semver.maxSatisfying(versions.map((ev) => ev.spec.version), ref.version);
    if (!maxSatisfying) {
        throw new error_1.FirebaseError(`No version of ${extensionRef} matches requested version ${ref.version}`);
    }
    return maxSatisfying;
}
exports.resolveVersion = resolveVersion;
//# sourceMappingURL=planner.js.map