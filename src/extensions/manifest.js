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
exports.readInstanceParam = exports.writeExtensionsToFirebaseJson = exports.getInstanceRef = exports.getInstanceTarget = exports.instanceExists = exports.loadConfig = exports.removeFromManifest = exports.writeLocalSecrets = exports.writeEmptyManifest = exports.writeToManifest = exports.ENV_DIRECTORY = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const refs = __importStar(require("./refs"));
const config_1 = require("../config");
const planner_1 = require("../deploy/extensions/planner");
const logger_1 = require("../logger");
const prompt_1 = require("../prompt");
const paramHelper_1 = require("./paramHelper");
const error_1 = require("../error");
const extensionsHelper_1 = require("./extensionsHelper");
const types_1 = require("./types");
exports.ENV_DIRECTORY = "extensions";
/**
 * Write a list of instanceSpecs to extensions manifest.
 *
 * The manifest is composed of both the extension instance list in firebase.json, and
 * env-var for each extension instance under ./extensions/*.env
 *
 * @param specs a list of InstanceSpec to write to the manifest
 * @param config existing config in firebase.json
 * @param options.nonInteractive will try to do the job without asking for user input.
 * @param options.force only when this flag is true this will overwrite existing .env files
 * @param allowOverwrite allows overwriting the entire manifest with the new specs
 */
async function writeToManifest(specs, config, options, allowOverwrite = false) {
    if (config.has("extensions") &&
        Object.keys(config.get("extensions")).length &&
        !options.nonInteractive &&
        !options.force) {
        const currentExtensions = Object.entries(config.get("extensions"))
            .map((i) => `${i[0]}: ${i[1]}`)
            .join("\n\t");
        if (allowOverwrite) {
            const overwrite = await (0, prompt_1.select)({
                message: `firebase.json already contains extensions:\n${currentExtensions}\nWould you like to overwrite or merge?`,
                choices: [
                    { name: "Overwrite", value: true },
                    { name: "Merge", value: false },
                ],
            });
            if (overwrite) {
                config.set("extensions", {});
            }
        }
    }
    writeExtensionsToFirebaseJson(specs, config);
    await writeEnvFiles(specs, config, options.force);
    await writeLocalSecrets(specs, config, options.force);
}
exports.writeToManifest = writeToManifest;
async function writeEmptyManifest(config, options) {
    if (!fs.existsSync(config.path("extensions"))) {
        fs.mkdirSync(config.path("extensions"));
    }
    if (config.has("extensions") && Object.keys(config.get("extensions")).length) {
        const currentExtensions = Object.entries(config.get("extensions"))
            .map((i) => `${i[0]}: ${i[1]}`)
            .join("\n\t");
        if (!(await (0, prompt_1.confirm)({
            message: `firebase.json already contains extensions:\n${currentExtensions}\nWould you like to overwrite them?`,
            nonInteractive: options?.nonInteractive,
            force: options?.force,
            default: false,
        }))) {
            return;
        }
    }
    config.set("extensions", {});
}
exports.writeEmptyManifest = writeEmptyManifest;
/**
 * Write the secrets in a list of ManifestInstanceSpec into extensions/{instance-id}.secret.local.
 *
 * Exported for testing.
 */
async function writeLocalSecrets(specs, config, force) {
    for (const spec of specs) {
        const extensionSpec = await (0, planner_1.getExtensionSpec)(spec);
        if (!extensionSpec.params) {
            continue;
        }
        const writeBuffer = {};
        const locallyOverridenSecretParams = extensionSpec.params.filter((p) => p.type === types_1.ParamType.SECRET && spec.params[p.param]?.local);
        for (const paramSpec of locallyOverridenSecretParams) {
            const key = paramSpec.param;
            const localValue = spec.params[key].local;
            writeBuffer[key] = localValue;
        }
        const content = Object.entries(writeBuffer)
            .sort((a, b) => {
            return a[0].localeCompare(b[0]);
        })
            .map((r) => `${r[0]}=${r[1]}`)
            .join("\n");
        if (content) {
            await config.askWriteProjectFile(`extensions/${spec.instanceId}.secret.local`, content, force);
        }
    }
}
exports.writeLocalSecrets = writeLocalSecrets;
/**
 * Remove an instance from extensions manifest.
 */
function removeFromManifest(instanceId, config) {
    if (!instanceExists(instanceId, config)) {
        throw new error_1.FirebaseError(`Extension instance ${instanceId} not found in firebase.json.`);
    }
    const extensions = config.get("extensions", {});
    extensions[instanceId] = undefined;
    config.set("extensions", extensions);
    config.writeProjectFile("firebase.json", config.src);
    logger_1.logger.info(`Removed extension instance ${instanceId} from firebase.json`);
    config.deleteProjectFile(`extensions/${instanceId}.env`);
    logger_1.logger.info(`Removed extension instance environment config extensions/${instanceId}.env`);
    if (config.projectFileExists(`extensions/${instanceId}.env.local`)) {
        config.deleteProjectFile(`extensions/${instanceId}.env.local`);
        logger_1.logger.info(`Removed extension instance local environment config extensions/${instanceId}.env.local`);
    }
    if (config.projectFileExists(`extensions/${instanceId}.secret.local`)) {
        config.deleteProjectFile(`extensions/${instanceId}.secret.local`);
        logger_1.logger.info(`Removed extension instance local secret config extensions/${instanceId}.secret.local`);
    }
    // TODO(lihes): Remove all project specific env files.
}
exports.removeFromManifest = removeFromManifest;
function loadConfig(options) {
    const existingConfig = config_1.Config.load(options, true);
    if (!existingConfig) {
        throw new error_1.FirebaseError("Not currently in a Firebase directory. Run `firebase init` to create a Firebase directory.");
    }
    return existingConfig;
}
exports.loadConfig = loadConfig;
/**
 * Checks if an instance name already exists in the manifest.
 */
function instanceExists(instanceId, config) {
    return !!config.get("extensions", {})[instanceId];
}
exports.instanceExists = instanceExists;
/**
 * Gets the instance's extension ref string or local path given an instanceId.
 */
function getInstanceTarget(instanceId, config) {
    if (!instanceExists(instanceId, config)) {
        throw new error_1.FirebaseError(`Could not find extension instance ${instanceId} in firebase.json`);
    }
    return config.get("extensions", {})[instanceId];
}
exports.getInstanceTarget = getInstanceTarget;
/**
 * Gets the instance's extension ref if exists.
 */
function getInstanceRef(instanceId, config) {
    const source = getInstanceTarget(instanceId, config);
    if ((0, extensionsHelper_1.isLocalPath)(source)) {
        throw new error_1.FirebaseError(`Extension instance ${instanceId} doesn't have a ref because it is from a local source`);
    }
    return refs.parse(source);
}
exports.getInstanceRef = getInstanceRef;
function writeExtensionsToFirebaseJson(specs, config) {
    const extensions = config.get("extensions", {});
    for (const s of specs) {
        let target;
        if (s.ref) {
            target = refs.toExtensionVersionRef(s.ref);
        }
        else if (s.localPath) {
            target = s.localPath;
        }
        else {
            throw new error_1.FirebaseError(`Unable to resolve ManifestInstanceSpec, make sure you provide either extension ref or a local path to extension source code`);
        }
        extensions[s.instanceId] = target;
    }
    config.set("extensions", extensions);
    config.writeProjectFile("firebase.json", config.src);
}
exports.writeExtensionsToFirebaseJson = writeExtensionsToFirebaseJson;
async function writeEnvFiles(specs, config, force) {
    for (const spec of specs) {
        const content = Object.entries(spec.params)
            .filter((r) => r[1].baseValue !== "" && r[1].baseValue !== undefined) // Don't write empty values
            .sort((a, b) => {
            return a[0].localeCompare(b[0]);
        })
            .map((r) => `${r[0]}=${r[1].baseValue}`)
            .join("\n");
        await config.askWriteProjectFile(`extensions/${spec.instanceId}.env`, content, force);
    }
}
/**
 * readParams gets the params for an extension instance from the `extensions` folder,
 * checking for project specific env files, then falling back to generic env files.
 * This checks the following locations & if a param is defined in multiple places, it prefers
 * whichever is higher on this list:
 *  - extensions/{instanceId}.env.local (only if checkLocal is true)
 *  - extensions/{instanceId}.env.{projectID}
 *  - extensions/{instanceId}.env.{projectNumber}
 *  - extensions/{instanceId}.env.{projectAlias}
 *  - extensions/{instanceId}.env
 */
function readInstanceParam(args) {
    const aliases = args.aliases ?? [];
    const filesToCheck = [
        `${args.instanceId}.env`,
        ...aliases.map((alias) => `${args.instanceId}.env.${alias}`),
        ...(args.projectNumber ? [`${args.instanceId}.env.${args.projectNumber}`] : []),
        ...(args.projectId ? [`${args.instanceId}.env.${args.projectId}`] : []),
    ];
    if (args.checkLocal) {
        filesToCheck.push(`${args.instanceId}.env.local`);
    }
    let noFilesFound = true;
    const combinedParams = {};
    for (const fileToCheck of filesToCheck) {
        try {
            const params = readParamsFile(args.projectDir, fileToCheck);
            logger_1.logger.debug(`Successfully read params from ${fileToCheck}`);
            noFilesFound = false;
            Object.assign(combinedParams, params);
        }
        catch (err) {
            logger_1.logger.debug(`${err}`);
        }
    }
    if (noFilesFound) {
        throw new error_1.FirebaseError(`No params file found for ${args.instanceId}`);
    }
    return combinedParams;
}
exports.readInstanceParam = readInstanceParam;
function readParamsFile(projectDir, fileName) {
    const paramPath = path.join(projectDir, exports.ENV_DIRECTORY, fileName);
    const params = (0, paramHelper_1.readEnvFile)(paramPath);
    return params;
}
//# sourceMappingURL=manifest.js.map