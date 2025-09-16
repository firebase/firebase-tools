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
exports.deploy = exports.isDeployingWebFramework = void 0;
const clc = __importStar(require("colorette"));
const logger_1 = require("../logger");
const api_1 = require("../api");
const colorette_1 = require("colorette");
const lodash_1 = require("lodash");
const projectUtils_1 = require("../projectUtils");
const utils_1 = require("../utils");
const error_1 = require("../error");
const track_1 = require("../track");
const lifecycleHooks_1 = require("./lifecycleHooks");
const experiments = __importStar(require("../experiments"));
const HostingTarget = __importStar(require("./hosting"));
const DatabaseTarget = __importStar(require("./database"));
const FirestoreTarget = __importStar(require("./firestore"));
const FunctionsTarget = __importStar(require("./functions"));
const StorageTarget = __importStar(require("./storage"));
const RemoteConfigTarget = __importStar(require("./remoteconfig"));
const ExtensionsTarget = __importStar(require("./extensions"));
const DataConnectTarget = __importStar(require("./dataconnect"));
const AppHostingTarget = __importStar(require("./apphosting"));
const frameworks_1 = require("../frameworks");
const prepare_1 = require("./hosting/prepare");
const github_1 = require("../init/features/hosting/github");
const deploy_1 = require("../commands/deploy");
const requirePermissions_1 = require("../requirePermissions");
const TARGETS = {
    hosting: HostingTarget,
    database: DatabaseTarget,
    firestore: FirestoreTarget,
    functions: FunctionsTarget,
    storage: StorageTarget,
    remoteconfig: RemoteConfigTarget,
    extensions: ExtensionsTarget,
    dataconnect: DataConnectTarget,
    apphosting: AppHostingTarget,
};
const chain = async function (fns, context, options, payload) {
    for (const latest of fns) {
        await latest(context, options, payload);
    }
};
const isDeployingWebFramework = (options) => {
    const config = options.config.get("hosting");
    if (!config)
        return false;
    const normalizedConfig = Array.isArray(config) ? config : [config];
    const webFrameworksInConfig = normalizedConfig.filter((c) => c?.source);
    // If no webframeworks are in config, a web framework is not being deployed
    if (webFrameworksInConfig.length === 0)
        return false;
    // If a web framework is present in config and no --only flag is present, a web framework is being deployed
    if (!options.only)
        return true;
    // If we're deploying a specific site/target when a web framework is present in config, check if the target is a web framework
    return options.only.split(",").some((it) => {
        const [target, site] = it.split(":");
        // If not deploying to Firebase Hosting, skip
        if (target !== "hosting")
            return false;
        // If no site specified but we're deploying to Firebase Hosting, a webframework is being deployed
        if (!site)
            return true;
        // If a site is specified, check if it's a web framework
        return webFrameworksInConfig.some((c) => [c.site, c.target].includes(site));
    });
};
exports.isDeployingWebFramework = isDeployingWebFramework;
/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
const deploy = async function (targetNames, options, customContext = {}) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const payload = {};
    // a shared context object for deploy targets to decorate as needed
    const context = Object.assign({ projectId }, customContext);
    const predeploys = [];
    const prepares = [];
    const deploys = [];
    const releases = [];
    const postdeploys = [];
    const startTime = Date.now();
    if (targetNames.includes("hosting") && (0, exports.isDeployingWebFramework)(options)) {
        experiments.assertEnabled("webframeworks", "deploy a web framework from source");
        await (0, frameworks_1.prepareFrameworks)("deploy", targetNames, context, options);
    }
    if (targetNames.includes("hosting") && (0, prepare_1.hasPinnedFunctions)(options)) {
        experiments.assertEnabled("pintags", "deploy a tagged function as a hosting rewrite");
        if (!targetNames.includes("functions")) {
            targetNames.unshift("functions");
            try {
                await (0, requirePermissions_1.requirePermissions)(options, deploy_1.TARGET_PERMISSIONS["functions"]);
            }
            catch (e) {
                if ((0, github_1.isRunningInGithubAction)()) {
                    throw new error_1.FirebaseError("It looks like you are deploying a Hosting site along with Cloud Functions " +
                        "using a GitHub action version that did not include Cloud Functions " +
                        "permissions. Please reinstall the GitHub action with" +
                        clc.bold("firebase init hosting:github"), { original: e });
                }
                else {
                    throw e;
                }
            }
        }
        await (0, prepare_1.addPinnedFunctionsToOnlyString)(context, options);
    }
    for (const targetName of targetNames) {
        const target = TARGETS[targetName];
        if (!target) {
            return Promise.reject(new error_1.FirebaseError(`${(0, colorette_1.bold)(targetName)} is not a valid deploy target`));
        }
        predeploys.push((0, lifecycleHooks_1.lifecycleHooks)(targetName, "predeploy"));
        prepares.push(target.prepare);
        if (!options.dryRun) {
            deploys.push(target.deploy);
            releases.push(target.release);
            postdeploys.push((0, lifecycleHooks_1.lifecycleHooks)(targetName, "postdeploy"));
        }
    }
    logger_1.logger.info();
    logger_1.logger.info((0, colorette_1.bold)((0, colorette_1.white)("===") + " Deploying to '" + projectId + "'..."));
    logger_1.logger.info();
    (0, utils_1.logBullet)("deploying " + (0, colorette_1.bold)(targetNames.join(", ")));
    await chain(predeploys, context, options, payload);
    await chain(prepares, context, options, payload);
    await chain(deploys, context, options, payload);
    await chain(releases, context, options, payload);
    await chain(postdeploys, context, options, payload);
    const duration = Date.now() - startTime;
    const analyticsParams = {
        interactive: options.nonInteractive ? "false" : "true",
    };
    Object.keys(TARGETS).reduce((accum, t) => {
        accum[t] = "false";
        return accum;
    }, analyticsParams);
    for (const t of targetNames) {
        analyticsParams[t] = "true";
    }
    await (0, track_1.trackGA4)("product_deploy", analyticsParams, duration);
    const successMessage = options.dryRun ? "Dry run complete!" : "Deploy complete!";
    logger_1.logger.info();
    (0, utils_1.logSuccess)((0, colorette_1.bold)((0, colorette_1.underline)(successMessage)));
    logger_1.logger.info();
    const deployedHosting = (0, lodash_1.includes)(targetNames, "hosting");
    logger_1.logger.info((0, colorette_1.bold)("Project Console:"), (0, utils_1.consoleUrl)(options.project ?? "_", "/overview"));
    if (deployedHosting) {
        (0, lodash_1.each)(context.hosting?.deploys, (deploy) => {
            logger_1.logger.info((0, colorette_1.bold)("Hosting URL:"), (0, utils_1.addSubdomain)((0, api_1.hostingOrigin)(), deploy.config.site));
        });
        const versionNames = context.hosting?.deploys.map((deploy) => deploy.version);
        return { hosting: versionNames?.length === 1 ? versionNames[0] : versionNames };
    }
    else {
        return { hosting: undefined };
    }
};
exports.deploy = deploy;
//# sourceMappingURL=index.js.map