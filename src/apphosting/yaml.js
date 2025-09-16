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
exports.toEnvList = exports.toEnvMap = exports.AppHostingYamlConfig = void 0;
const path_1 = require("path");
const utils_1 = require("../utils");
const config_1 = require("./config");
const yaml = __importStar(require("yaml"));
const jsYaml = __importStar(require("js-yaml"));
const path = __importStar(require("path"));
const fsutils_1 = require("../fsutils");
const error_1 = require("../error");
/**
 * AppHostingYamlConfig is an object representing an apphosting.yaml configuration
 * present in the user's codebase (i.e 'apphosting.yaml', 'apphosting.staging.yaml', etc).
 */
class AppHostingYamlConfig {
    constructor() {
        this.env = {};
    }
    /**
     * Reads in the App Hosting yaml file found in filePath, parses the secrets and
     * environment variables, and returns an object that makes it easier to
     * programatically read or manipulate the App Hosting config.
     */
    static async loadFromFile(filePath) {
        if (!(0, fsutils_1.fileExistsSync)(filePath)) {
            throw new error_1.FirebaseError(`Cannot load ${filePath} from given path, it doesn't exist`);
        }
        const config = new AppHostingYamlConfig();
        const file = await (0, utils_1.readFileFromDirectory)((0, path_1.dirname)(filePath), (0, path_1.basename)(filePath));
        config.filename = path.basename(filePath);
        const loadedAppHostingYaml = (await (0, utils_1.wrappedSafeLoad)(file.source)) ?? {};
        if (loadedAppHostingYaml.env) {
            config.env = toEnvMap(loadedAppHostingYaml.env);
        }
        return config;
    }
    /**
     * Simply returns an empty AppHostingYamlConfig (no environment variables
     * or secrets).
     */
    static empty() {
        return new AppHostingYamlConfig();
    }
    /**
     * Merges this AppHostingYamlConfig with another config, the incoming config
     * has precedence if there are any conflicting configurations.
     * */
    merge(other, allowSecretsToBecomePlaintext = true) {
        if (!allowSecretsToBecomePlaintext) {
            const wereSecrets = Object.entries(this.env)
                .filter(([, env]) => env.secret)
                .map(([key]) => key);
            if (wereSecrets.some((key) => other.env[key]?.value)) {
                throw new error_1.FirebaseError(`Cannot convert secret to plaintext in ${other.filename ?? "apphosting yaml"}`);
            }
        }
        this.env = {
            ...this.env,
            ...other.env,
        };
    }
    /**
     * Loads the given file if it exists and updates it. If
     * it does not exist a new file will be created.
     */
    async upsertFile(filePath) {
        let yamlConfigToWrite = {};
        if ((0, fsutils_1.fileExistsSync)(filePath)) {
            const file = await (0, utils_1.readFileFromDirectory)((0, path_1.dirname)(filePath), (0, path_1.basename)(filePath));
            yamlConfigToWrite = await (0, utils_1.wrappedSafeLoad)(file.source);
        }
        yamlConfigToWrite.env = toEnvList(this.env);
        (0, config_1.store)(filePath, yaml.parseDocument(jsYaml.dump(yamlConfigToWrite)));
    }
}
exports.AppHostingYamlConfig = AppHostingYamlConfig;
// TODO: generalize into a utility function and remove the key from the array type.
function toEnvMap(envs) {
    return Object.fromEntries(envs.map((env) => {
        const variable = env.variable;
        const tmp = { ...env };
        delete env.variable;
        return [variable, tmp];
    }));
}
exports.toEnvMap = toEnvMap;
function toEnvList(envs) {
    return Object.entries(envs).map(([variable, env]) => {
        return { ...env, variable };
    });
}
exports.toEnvList = toEnvList;
//# sourceMappingURL=yaml.js.map