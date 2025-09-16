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
exports.getBackend = exports.getBackendForAmbiguousLocation = exports.chooseBackends = exports.promptExistingBackend = exports.getBackendForLocation = exports.promptLocation = exports.deleteBackendAndPoll = exports.setDefaultTrafficPolicy = exports.createBackend = exports.promptNewBackendId = exports.ensureAppHostingComputeServiceAccount = exports.createGitRepoLink = exports.ensureRequiredApisEnabled = exports.doSetupSourceDeploy = exports.doSetup = void 0;
const clc = __importStar(require("colorette"));
const poller = __importStar(require("../operation-poller"));
const apphosting = __importStar(require("../gcp/apphosting"));
const githubConnections = __importStar(require("./githubConnections"));
const utils_1 = require("../utils");
const api_1 = require("../api");
const apphosting_1 = require("../gcp/apphosting");
const resourceManager_1 = require("../gcp/resourceManager");
const iam = __importStar(require("../gcp/iam"));
const error_1 = require("../error");
const prompt_1 = require("../prompt");
const constants_1 = require("./constants");
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const deploymentTool = __importStar(require("../deploymentTool"));
const app_1 = require("./app");
const ora = __importStar(require("ora"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const rollout_1 = require("./rollout");
const fuzzy = __importStar(require("fuzzy"));
const DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME = "firebase-app-hosting-compute";
const apphostingPollerOptions = {
    apiOrigin: (0, api_1.apphostingOrigin)(),
    apiVersion: apphosting_1.API_VERSION,
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
async function tlsReady(url) {
    // Note, we do not use the helper libraries because they impose additional logic on content type and parsing.
    try {
        await (0, node_fetch_1.default)(url);
        return true;
    }
    catch (err) {
        // At the time of this writing, the error code is ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE.
        // I've chosen to use a regexp in an attempt to be forwards compatible with new versions of
        // SSL.
        const maybeNodeError = err;
        if (/HANDSHAKE_FAILURE/.test(maybeNodeError?.cause?.code) ||
            "EPROTO" === maybeNodeError?.code) {
            return false;
        }
        return true;
    }
}
async function awaitTlsReady(url) {
    let ready;
    do {
        ready = await tlsReady(url);
        if (!ready) {
            await (0, utils_1.sleep)(1000 /* ms */);
        }
    } while (!ready);
}
/**
 * Set up a new App Hosting backend.
 */
async function doSetup(projectId, nonInteractive, webAppName, backendId, serviceAccount, primaryRegion, rootDir) {
    await ensureRequiredApisEnabled(projectId);
    // Hack: Because IAM can take ~45 seconds to propagate, we provision the service account as soon as
    // possible to reduce the likelihood that the subsequent Cloud Build fails. See b/336862200.
    await ensureAppHostingComputeServiceAccount(projectId, serviceAccount ? serviceAccount : null);
    // TODO(https://github.com/firebase/firebase-tools/issues/8283): The "primary region"
    // is still "locations" in the V1 API. This will change in the V2 API and we may need to update
    // the variables and API methods we're calling under the hood when fetching "primary region".
    let location = primaryRegion;
    let gitRepositoryLink;
    let branch;
    if (nonInteractive) {
        if (!backendId || !primaryRegion) {
            throw new error_1.FirebaseError("nonInteractive mode requires a backendId and primaryRegion");
        }
    }
    else {
        if (!location) {
            location = await promptLocation(projectId, "Select a primary region to host your backend:\n");
        }
        if (!backendId) {
            (0, utils_1.logBullet)(`${clc.yellow("===")} Set up your backend`);
            backendId = await promptNewBackendId(projectId, location);
            (0, utils_1.logSuccess)(`Name set to ${backendId}\n`);
        }
        if (!rootDir) {
            rootDir = await (0, prompt_1.input)({
                default: "/",
                message: "Specify your app's root directory relative to your repository",
            });
        }
        gitRepositoryLink = await githubConnections.linkGitHubRepository(projectId, location);
        // TODO: Once tag patterns are implemented, prompt which method the user
        // prefers. We could reduce the number of questions asked by letting people
        // enter tag:<pattern>?
        branch = await githubConnections.promptGitHubBranch(gitRepositoryLink);
        (0, utils_1.logSuccess)(`Repo linked successfully!\n`);
    }
    // Confirm both backendId and location are set at this point
    if (!location || !backendId) {
        // This should not happen based on the logic above, but it satisfies the type checker.
        throw new error_1.FirebaseError("Internal error: location or backendId is not defined.");
    }
    const webApp = await app_1.webApps.getOrCreateWebApp(projectId, webAppName ? webAppName : null, backendId);
    if (!webApp) {
        (0, utils_1.logWarning)(`Firebase web app not set`);
    }
    const createBackendSpinner = ora("Creating your new backend...").start();
    const backend = await createBackend(projectId, location, backendId, serviceAccount ? serviceAccount : null, gitRepositoryLink, webApp?.id, rootDir);
    createBackendSpinner.succeed(`Successfully created backend!\n\t${backend.name}\n`);
    // In non-interactive mode, we never connected the backend to a github repo. Return
    // early and skip the rollout and setting default traffic policy.
    if (nonInteractive) {
        return;
    }
    if (!branch) {
        throw new error_1.FirebaseError("Branch was not set while connecting to a github repo.");
    }
    await setDefaultTrafficPolicy(projectId, location, backendId, branch);
    const confirmRollout = await (0, prompt_1.confirm)({
        default: true,
        message: "Do you want to deploy now?",
    });
    if (!confirmRollout) {
        (0, utils_1.logSuccess)(`Your backend will be deployed at:\n\thttps://${backend.uri}`);
        return;
    }
    const url = `https://${backend.uri}`;
    (0, utils_1.logBullet)(`You may also track this rollout at:\n\t${(0, api_1.consoleOrigin)()}/project/${projectId}/apphosting`);
    // TODO: Previous versions of this command printed the URL before the rollout started so that
    // if a user does exit they will know where to go later. Should this be re-added?
    const createRolloutSpinner = ora("Starting a new rollout; this may take a few minutes. It's safe to exit now.").start();
    await (0, rollout_1.orchestrateRollout)({
        projectId,
        location,
        backendId,
        buildInput: {
            source: {
                codebase: {
                    branch,
                },
            },
        },
        isFirstRollout: true,
    });
    createRolloutSpinner.succeed("Rollout complete");
    if (!(await tlsReady(url))) {
        const tlsSpinner = ora("Finalizing your backend's TLS certificate; this may take a few minutes.").start();
        await awaitTlsReady(url);
        tlsSpinner.succeed("TLS certificate ready");
    }
    (0, utils_1.logSuccess)(`Your backend is now deployed at:\n\thttps://${backend.uri}`);
}
exports.doSetup = doSetup;
/**
 * Setup up a new App Hosting backend to deploy from source.
 */
async function doSetupSourceDeploy(projectId, backendId) {
    const location = await promptLocation(projectId, "Select a primary region to host your backend:\n");
    const webAppSpinner = ora("Creating a new web app...\n").start();
    const webApp = await app_1.webApps.getOrCreateWebApp(projectId, null, backendId);
    if (!webApp) {
        (0, utils_1.logWarning)(`Firebase web app not set`);
    }
    webAppSpinner.stop();
    const createBackendSpinner = ora("Creating your new backend...").start();
    const backend = await createBackend(projectId, location, backendId, null, undefined, webApp?.id);
    createBackendSpinner.succeed(`Successfully created backend!\n\t${backend.name}\n`);
    return {
        backend,
        location,
    };
}
exports.doSetupSourceDeploy = doSetupSourceDeploy;
/**
 * Check that all GCP APIs required for App Hosting are enabled.
 */
async function ensureRequiredApisEnabled(projectId) {
    await Promise.all([
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.developerConnectOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.cloudbuildOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.secretManagerOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.cloudRunApiOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.artifactRegistryDomain)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.iamOrigin)(), "apphosting", true),
    ]);
}
exports.ensureRequiredApisEnabled = ensureRequiredApisEnabled;
/**
 * Set up a new App Hosting-type Developer Connect GitRepoLink, optionally with a specific connection ID
 */
async function createGitRepoLink(projectId, location, connectionId) {
    await Promise.all([
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.developerConnectOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.secretManagerOrigin)(), "apphosting", true),
        (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.iamOrigin)(), "apphosting", true),
    ]);
    const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);
    if (location) {
        if (!allowedLocations.includes(location)) {
            throw new error_1.FirebaseError(`Invalid location ${location}. Valid choices are ${allowedLocations.join(", ")}`);
        }
    }
    location =
        location ||
            (await promptLocation(projectId, "Select a location for your GitRepoLink's connection:\n"));
    await githubConnections.linkGitHubRepository(projectId, location, connectionId);
}
exports.createGitRepoLink = createGitRepoLink;
/**
 * Ensures the service account is present the user has permissions to use it by
 * checking the `iam.serviceAccounts.actAs` permission. If the permissions
 * check fails, this returns an error. Otherwise, it attempts to provision the
 * service account.
 */
async function ensureAppHostingComputeServiceAccount(projectId, serviceAccount) {
    const sa = serviceAccount || defaultComputeServiceAccountEmail(projectId);
    const name = `projects/${projectId}/serviceAccounts/${sa}`;
    try {
        await iam.testResourceIamPermissions((0, api_1.iamOrigin)(), "v1", name, ["iam.serviceAccounts.actAs"], `projects/${projectId}`);
    }
    catch (err) {
        if (!(err instanceof error_1.FirebaseError)) {
            throw err;
        }
        if (err.status === 403) {
            throw new error_1.FirebaseError(`Failed to create backend due to missing delegation permissions for ${sa}. Make sure you have the iam.serviceAccounts.actAs permission.`, { original: err });
        }
        else if (err.status !== 404) {
            throw new error_1.FirebaseError("Unexpected error occurred while testing for IAM service account permissions", { original: err });
        }
    }
    await provisionDefaultComputeServiceAccount(projectId);
}
exports.ensureAppHostingComputeServiceAccount = ensureAppHostingComputeServiceAccount;
/**
 * Prompts the user for a backend id and verifies that it doesn't match a pre-existing backend.
 */
async function promptNewBackendId(projectId, location) {
    while (true) {
        const backendId = await (0, prompt_1.input)({
            default: "my-web-app",
            message: "Provide a name for your backend [1-30 characters]",
            validate: (s) => s.length >= 1 && s.length <= 30,
        });
        try {
            await apphosting.getBackend(projectId, location, backendId);
        }
        catch (err) {
            if ((0, error_1.getErrStatus)(err) === 404) {
                return backendId;
            }
            throw new error_1.FirebaseError(`Failed to check if backend with id ${backendId} already exists in ${location}`, { original: (0, error_1.getError)(err) });
        }
        (0, utils_1.logWarning)(`Backend with id ${backendId} already exists in ${location}`);
    }
}
exports.promptNewBackendId = promptNewBackendId;
function defaultComputeServiceAccountEmail(projectId) {
    return `${DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`;
}
/**
 * Creates (and waits for) a new backend. Optionally may create the default compute service account if
 * it was requested and doesn't exist.
 */
async function createBackend(projectId, location, backendId, serviceAccount, repository, webAppId, rootDir = "/") {
    const defaultServiceAccount = defaultComputeServiceAccountEmail(projectId);
    const backendReqBody = {
        servingLocality: "GLOBAL_ACCESS",
        codebase: repository
            ? {
                repository: `${repository.name}`,
                rootDirectory: rootDir,
            }
            : undefined,
        labels: deploymentTool.labels(),
        serviceAccount: serviceAccount || defaultServiceAccount,
        appId: webAppId,
    };
    async function createBackendAndPoll() {
        const op = await apphosting.createBackend(projectId, location, backendReqBody, backendId);
        return await poller.pollOperation({
            ...apphostingPollerOptions,
            pollerName: `create-${projectId}-${location}-${backendId}`,
            operationResourceName: op.name,
        });
    }
    return await createBackendAndPoll();
}
exports.createBackend = createBackend;
async function provisionDefaultComputeServiceAccount(projectId) {
    try {
        await iam.createServiceAccount(projectId, DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME, "Default service account used to run builds and deploys for Firebase App Hosting", "Firebase App Hosting compute service account");
    }
    catch (err) {
        // 409 Already Exists errors can safely be ignored.
        if ((0, error_1.getErrStatus)(err) !== 409) {
            throw err;
        }
    }
    try {
        await (0, resourceManager_1.addServiceAccountToRoles)(projectId, defaultComputeServiceAccountEmail(projectId), [
            "roles/firebaseapphosting.computeRunner",
            "roles/firebase.sdkAdminServiceAgent",
            "roles/developerconnect.readTokenAccessor",
            "roles/storage.objectViewer",
        ], 
        /* skipAccountLookup= */ true);
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 400) {
            (0, utils_1.logWarning)("Your App Hosting compute service account is still being provisioned in the background. If you encounter an error, please try again after a few moments.");
        }
        else {
            throw err;
        }
    }
}
/**
 * Sets the default rollout policy to route 100% of traffic to the latest deploy.
 */
async function setDefaultTrafficPolicy(projectId, location, backendId, codebaseBranch) {
    const traffic = {
        rolloutPolicy: {
            codebaseBranch: codebaseBranch,
        },
    };
    const op = await apphosting.updateTraffic(projectId, location, backendId, traffic);
    await poller.pollOperation({
        ...apphostingPollerOptions,
        pollerName: `updateTraffic-${projectId}-${location}-${backendId}`,
        operationResourceName: op.name,
    });
}
exports.setDefaultTrafficPolicy = setDefaultTrafficPolicy;
/**
 * Deletes the given backend. Polls till completion.
 */
async function deleteBackendAndPoll(projectId, location, backendId) {
    const op = await apphosting.deleteBackend(projectId, location, backendId);
    await poller.pollOperation({
        ...apphostingPollerOptions,
        pollerName: `delete-${projectId}-${location}-${backendId}`,
        operationResourceName: op.name,
    });
}
exports.deleteBackendAndPoll = deleteBackendAndPoll;
/**
 * Prompts the user for a location. If there's only a single valid location, skips the prompt and returns that location.
 */
async function promptLocation(projectId, prompt = "Please select a location:") {
    const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);
    if (allowedLocations.length === 1) {
        return allowedLocations[0];
    }
    const location = await (0, prompt_1.select)({
        default: constants_1.DEFAULT_LOCATION,
        message: prompt,
        choices: allowedLocations,
    });
    (0, utils_1.logSuccess)(`Location set to ${location}.\n`);
    return location;
}
exports.promptLocation = promptLocation;
/**
 * Fetches a backend from the server in the specified region (location).
 */
async function getBackendForLocation(projectId, location, backendId) {
    try {
        return await apphosting.getBackend(projectId, location, backendId);
    }
    catch (err) {
        throw new error_1.FirebaseError(`No backend named "${backendId}" found in ${location}.`, {
            original: (0, error_1.getError)(err),
        });
    }
}
exports.getBackendForLocation = getBackendForLocation;
/**
 * Prompts users to select an existing backend.
 * @param projectId the user's project ID
 * @param promptMessage prompt message to display to the user
 * @return the selected backend ID
 */
async function promptExistingBackend(projectId, promptMessage) {
    const { backends } = await apphosting.listBackends(projectId, "-");
    const backendId = await (0, prompt_1.search)({
        message: promptMessage,
        source: (input = "") => {
            return new Promise((resolve) => resolve([
                ...fuzzy
                    .filter(input, backends, {
                    extract: (backend) => apphosting.parseBackendName(backend.name).id,
                })
                    .map((result) => {
                    return {
                        name: apphosting.parseBackendName(result.original.name).id,
                        value: apphosting.parseBackendName(result.original.name).id,
                    };
                }),
            ]));
        },
    });
    return backendId;
}
exports.promptExistingBackend = promptExistingBackend;
/**
 * Fetches backends of the given backendId and lets the user choose if more than one is found.
 */
async function chooseBackends(projectId, backendId, chooseBackendPrompt, force) {
    let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
    if (unreachable && unreachable.length !== 0) {
        (0, utils_1.logWarning)(`The following locations are currently unreachable: ${unreachable.join(",")}.\n` +
            "If your backend is in one of these regions, please try again later.");
    }
    backends = backends.filter((backend) => apphosting.parseBackendName(backend.name).id === backendId);
    if (backends.length === 0) {
        throw new error_1.FirebaseError(`No backend named "${backendId}" found.`);
    }
    if (backends.length === 1) {
        return backends;
    }
    if (force) {
        throw new error_1.FirebaseError(`Force cannot be used because multiple backends were found with ID ${backendId}.`);
    }
    const backendsByDisplay = new Map();
    backends.forEach((backend) => {
        const { location, id } = apphosting.parseBackendName(backend.name);
        backendsByDisplay.set(`${id}(${location})`, backend);
    });
    const chosenBackendDisplays = await (0, prompt_1.checkbox)({
        message: chooseBackendPrompt,
        choices: Array.from(backendsByDisplay.keys(), (name) => {
            return {
                checked: false,
                name: name,
                value: name,
            };
        }),
    });
    const chosenBackends = [];
    chosenBackendDisplays.forEach((backendDisplay) => {
        const backend = backendsByDisplay.get(backendDisplay);
        if (backend !== undefined) {
            chosenBackends.push(backend);
        }
    });
    return chosenBackends;
}
exports.chooseBackends = chooseBackends;
/**
 * Fetches a backend from the server. If there are multiple backends with that name (ie multi-regional backends),
 * prompts the user to disambiguate. If the force option is specified and multiple backends have the same name,
 * it throws an error.
 */
async function getBackendForAmbiguousLocation(projectId, backendId, locationDisambugationPrompt, force) {
    let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
    if (unreachable && unreachable.length !== 0) {
        (0, utils_1.logWarning)(`The following locations are currently unreachable: ${unreachable.join(", ")}.\n` +
            "If your backend is in one of these regions, please try again later.");
    }
    backends = backends.filter((backend) => apphosting.parseBackendName(backend.name).id === backendId);
    if (backends.length === 0) {
        throw new error_1.FirebaseError(`No backend named "${backendId}" found.`);
    }
    if (backends.length === 1) {
        return backends[0];
    }
    if (force) {
        throw new error_1.FirebaseError(`Multiple backends found with ID ${backendId}. Please specify the region of your target backend.`);
    }
    const backendsByLocation = new Map();
    backends.forEach((backend) => backendsByLocation.set(apphosting.parseBackendName(backend.name).location, backend));
    const location = await (0, prompt_1.select)({
        message: locationDisambugationPrompt,
        choices: [...backendsByLocation.keys()],
    });
    return backendsByLocation.get(location);
}
exports.getBackendForAmbiguousLocation = getBackendForAmbiguousLocation;
/**
 * Fetches a backend from the server. If there are multiple backends with the name, it will throw an error
 * telling the user that there are other backends with the same name that need to be deleted.
 */
async function getBackend(projectId, backendId) {
    let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
    backends = backends.filter((backend) => apphosting.parseBackendName(backend.name).id === backendId);
    if (backends.length > 1) {
        const locations = backends.map((b) => apphosting.parseBackendName(b.name).location);
        throw new error_1.FirebaseError(`You have multiple backends with the same ${backendId} ID in regions: ${locations.join(", ")}. This is not allowed until we can support more locations. ` +
            "Please delete and recreate any backends that share an ID with another backend.");
    }
    if (backends.length === 1) {
        return backends[0];
    }
    if (unreachable && unreachable.length !== 0) {
        (0, utils_1.logWarning)(`Backends with the following primary regions are unreachable: ${unreachable.join(", ")}.\n` +
            "If your backend is in one of these regions, please try again later.");
    }
    throw new error_1.FirebaseError(`No backend named ${backendId} found.`);
}
exports.getBackend = getBackend;
//# sourceMappingURL=backend.js.map