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
exports.suggestedTestKeyName = exports.overrideChosenEnv = exports.maybeGenerateEmulatorYaml = exports.maybeAddSecretToYaml = exports.upsertEnv = exports.findEnv = exports.store = exports.load = exports.listAppHostingFilesInPath = exports.discoverBackendRoot = exports.APPHOSTING_YAML_FILE_REGEX = exports.APPHOSTING_LOCAL_YAML_FILE = exports.APPHOSTING_EMULATORS_YAML_FILE = exports.APPHOSTING_BASE_YAML_FILE = void 0;
const path_1 = require("path");
const fs_1 = require("fs");
const yaml = __importStar(require("yaml"));
const clc = __importStar(require("colorette"));
const fs = __importStar(require("../fsutils"));
const prompt = __importStar(require("../prompt"));
const dialogs = __importStar(require("./secrets/dialogs"));
const yaml_1 = require("./yaml");
const logger_1 = require("../logger");
const csm = __importStar(require("../gcp/secretManager"));
const error_1 = require("../error");
// Common config across all environments
exports.APPHOSTING_BASE_YAML_FILE = "apphosting.yaml";
// Modern version of local configuration that is intended to be safe to commit.
// In order to ensure safety, values that are secret environment variables in
// apphosting.yaml cannot be made plaintext in apphosting.emulators.yaml
exports.APPHOSTING_EMULATORS_YAML_FILE = "apphosting.emulator.yaml";
// Legacy/undocumented version of local configuration that is allowed to store
// values that are secrets in preceeding files as plaintext. It is not safe
// to commit to SCM
exports.APPHOSTING_LOCAL_YAML_FILE = "apphosting.local.yaml";
exports.APPHOSTING_YAML_FILE_REGEX = /^apphosting(\.[a-z0-9_]+)?\.yaml$/;
/**
 * Returns the absolute path for an app hosting backend root.
 *
 * Backend root is determined by looking for an apphosting.yaml
 * file.
 */
function discoverBackendRoot(cwd) {
    let dir = cwd;
    while (true) {
        const files = fs.listFiles(dir);
        if (files.some((file) => exports.APPHOSTING_YAML_FILE_REGEX.test(file))) {
            return dir;
        }
        // We've hit project root
        if (files.includes("firebase.json")) {
            return null;
        }
        const parent = (0, path_1.dirname)(dir);
        // We've hit the filesystem root
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}
exports.discoverBackendRoot = discoverBackendRoot;
/**
 * Returns paths of apphosting config files in the given path
 */
function listAppHostingFilesInPath(path) {
    return fs
        .listFiles(path)
        .filter((file) => exports.APPHOSTING_YAML_FILE_REGEX.test(file))
        .map((file) => (0, path_1.join)(path, file));
}
exports.listAppHostingFilesInPath = listAppHostingFilesInPath;
/**
 * Load an apphosting yaml file if it exists.
 * Throws if the file exists but is malformed.
 * Returns an empty document if the file does not exist.
 */
function load(yamlPath) {
    let raw;
    try {
        raw = fs.readFile(yamlPath);
    }
    catch (err) {
        if (err.code !== "ENOENT") {
            throw new error_1.FirebaseError(`Unexpected error trying to load ${yamlPath}`, {
                original: (0, error_1.getError)(err),
            });
        }
        return new yaml.Document();
    }
    return yaml.parseDocument(raw);
}
exports.load = load;
/** Save apphosting.yaml */
function store(yamlPath, document) {
    (0, fs_1.writeFileSync)(yamlPath, document.toString());
}
exports.store = store;
/** Gets the first Env with a given variable name. */
function findEnv(document, variable) {
    if (!document.has("env")) {
        return undefined;
    }
    const envs = document.get("env");
    for (const env of envs.items) {
        if (env.get("variable") === variable) {
            return env.toJSON();
        }
    }
    return undefined;
}
exports.findEnv = findEnv;
/** Inserts or overwrites the first Env with the env.variable name. */
function upsertEnv(document, env) {
    if (!document.has("env")) {
        document.set("env", document.createNode([env]));
        return;
    }
    const envs = document.get("env");
    // The type system in this library is... not great at propagating type info
    const envYaml = document.createNode(env);
    for (let i = 0; i < envs.items.length; i++) {
        if (envs.items[i].get("variable") === env.variable) {
            // Note to reviewers: Should we instead set per each field so that we preserve comments?
            envs.set(i, envYaml);
            return;
        }
    }
    envs.add(envYaml);
}
exports.upsertEnv = upsertEnv;
// We must go through the exports object for stubbing to work in tests.
const dynamicDispatch = exports;
/**
 * Given a secret name, guides the user whether they want to add that secret to the specified apphosting yaml file.
 * If an the file exists and includes the secret already is used as a variable name, exist early.
 * If the file does not exist, offers to create it.
 * If env does not exist, offers to add it.
 * If secretName is not a valid env var name, prompts for an env var name.
 */
async function maybeAddSecretToYaml(secretName, fileName = exports.APPHOSTING_BASE_YAML_FILE) {
    // Note: The API proposal suggested that we would check if the env exists. This is stupidly hard because the YAML may not exist yet.
    const backendRoot = dynamicDispatch.discoverBackendRoot(process.cwd());
    let path;
    let projectYaml;
    if (backendRoot) {
        path = (0, path_1.join)(backendRoot, fileName);
        projectYaml = dynamicDispatch.load(path);
    }
    else {
        projectYaml = new yaml.Document();
    }
    // TODO: Should we search for any env where it has secret: secretName rather than variable: secretName?
    if (dynamicDispatch.findEnv(projectYaml, secretName)) {
        return;
    }
    const addToYaml = await prompt.confirm({
        message: `Would you like to add this secret to ${fileName}?`,
        default: true,
    });
    if (!addToYaml) {
        return;
    }
    if (!path) {
        path = await prompt.input({
            message: `It looks like you don't have an ${fileName} yet. Where would you like to store it?`,
            default: process.cwd(),
        });
        path = (0, path_1.join)(path, fileName);
    }
    const envName = await dialogs.envVarForSecret(secretName, 
    /* trimTestPrefix= */ fileName === exports.APPHOSTING_EMULATORS_YAML_FILE);
    dynamicDispatch.upsertEnv(projectYaml, {
        variable: envName,
        secret: secretName,
    });
    dynamicDispatch.store(path, projectYaml);
}
exports.maybeAddSecretToYaml = maybeAddSecretToYaml;
/**
 * Generates an apphosting.emulator.yaml if the user chooses to do so.
 * Returns the resolved env that an emulator would see so that future code can
 * grant access.
 */
async function maybeGenerateEmulatorYaml(projectId, backendRoot) {
    // Even if the app is in /project/app, the user might have their apphosting.yaml file in /project/apphosting.yaml.
    // Walk up the tree to see if we find other local files so that we can put apphosting.emulator.yaml in the right place.
    const basePath = dynamicDispatch.discoverBackendRoot(backendRoot) || backendRoot;
    if (fs.fileExistsSync((0, path_1.join)(basePath, exports.APPHOSTING_EMULATORS_YAML_FILE))) {
        logger_1.logger.debug("apphosting.emulator.yaml already exists, skipping generation and secrets access prompt");
        return null;
    }
    let baseConfig;
    try {
        baseConfig = await yaml_1.AppHostingYamlConfig.loadFromFile((0, path_1.join)(basePath, exports.APPHOSTING_BASE_YAML_FILE));
    }
    catch {
        baseConfig = yaml_1.AppHostingYamlConfig.empty();
    }
    const createFile = await prompt.confirm({
        message: "The App Hosting emulator uses a file called apphosting.emulator.yaml to override " +
            "values in apphosting.yaml for local testing. This codebase does not have one, would you like " +
            "to create it?",
        default: true,
    });
    if (!createFile) {
        return (0, yaml_1.toEnvList)(baseConfig.env);
    }
    const newEnv = await dynamicDispatch.overrideChosenEnv(projectId, baseConfig.env || {});
    // Ensures we don't write 'null' if there are no overwritten env.
    const envList = Object.entries(newEnv);
    if (envList.length) {
        const newYaml = new yaml.Document();
        for (const [variable, env] of envList) {
            // N.B. This is a bit weird. We're not defensively assuring that the key of the variable name is used,
            // but this ensures that the generated YAML shows "variable" before "value" or "secret", which is what
            // docs canonically show.
            dynamicDispatch.upsertEnv(newYaml, { variable, ...env });
        }
        dynamicDispatch.store((0, path_1.join)(basePath, exports.APPHOSTING_EMULATORS_YAML_FILE), newYaml);
    }
    else {
        // The yaml library _always_ stringifies empty objects and arrays as {} and [] and there is
        // no setting on toString to change this, so we'll craft the YAML file manually.
        const sample = "env:\n" +
            "#- variable: ENV_VAR_NAME\n" +
            "#  value: plaintext value\n" +
            "#- variable: SECRET_ENV_VAR_NAME\n" +
            "#  secret: cloud-secret-manager-id\n";
        (0, fs_1.writeFileSync)((0, path_1.join)(basePath, exports.APPHOSTING_EMULATORS_YAML_FILE), sample);
    }
    return (0, yaml_1.toEnvList)({ ...baseConfig.env, ...newEnv });
}
exports.maybeGenerateEmulatorYaml = maybeGenerateEmulatorYaml;
/**
 * Prompts a user which env they'd like to override and then asks them for the new values.
 * Values cannot change between plaintext and secret while overriding them. Users are warned/asked to confirm
 * if they choose to reuse an existing secret value. Secret reference IDs are suggested with a test- prefix to suggest
 * a design pattern.
 * Returns a map of modified environment variables.
 */
async function overrideChosenEnv(projectId, env) {
    const names = Object.keys(env);
    if (!names.length) {
        return {};
    }
    const toOverwrite = await prompt.checkbox({
        message: "Which environment variables would you like to override?",
        choices: names,
    });
    if (!projectId && toOverwrite.some((name) => "secret" in env[name])) {
        throw new error_1.FirebaseError(`Need a project ID to overwrite a secret. Either use ${clc.bold("firebase use")} or pass the ${clc.bold("--project")} flag`);
    }
    const newEnv = {};
    for (const name of toOverwrite) {
        if ("value" in env[name]) {
            const newValue = await prompt.input(`What new value would you like for plaintext ${name}?`);
            newEnv[name] = { variable: name, value: newValue };
            continue;
        }
        let secretRef;
        let action = "pick-new";
        while (action === "pick-new") {
            secretRef = await prompt.input({
                message: `What would you like to name the secret reference for ${name}?`,
                default: suggestedTestKeyName(name),
            });
            if (await csm.secretExists(projectId, secretRef)) {
                action = await prompt.select({
                    message: "This secret reference already exists, would you like to reuse it or create a new one?",
                    choices: [
                        { name: "Reuse it", value: "reuse" },
                        { name: "Create a new one", value: "pick-new" },
                    ],
                });
            }
            else {
                action = "create";
            }
        }
        newEnv[name] = { variable: name, secret: secretRef };
        if (action === "reuse") {
            continue;
        }
        const secretValue = await prompt.password(`What new value would you like for secret ${name} [input is hidden]?`);
        // TODO: Do we need to support overriding locations? Inferring them from the original?
        await csm.createSecret(projectId, secretRef, { [csm.FIREBASE_MANAGED]: "apphosting" });
        await csm.addVersion(projectId, secretRef, secretValue);
    }
    return newEnv;
}
exports.overrideChosenEnv = overrideChosenEnv;
function suggestedTestKeyName(variable) {
    return "test-" + variable.replace(/_/g, "-").toLowerCase();
}
exports.suggestedTestKeyName = suggestedTestKeyName;
//# sourceMappingURL=config.js.map