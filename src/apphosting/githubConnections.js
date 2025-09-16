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
exports.getGitHubCommit = exports.getGitHubBranch = exports.fetchRepositoryCloneUris = exports.listAppHostingConnections = exports.getOrCreateRepository = exports.getOrCreateConnection = exports.createConnection = exports.ensureSecretManagerAdminGrant = exports.promptGitHubBranch = exports.getOrCreateOauthConnection = exports.listValidInstallations = exports.promptGitHubInstallation = exports.getConnectionForInstallation = exports.linkGitHubRepository = exports.getOrCreateFullyInstalledGithubConnection = exports.generateConnectionId = exports.generateRepositoryId = exports.extractRepoSlugFromUri = exports.parseConnectionName = void 0;
const clc = __importStar(require("colorette"));
const devConnect = __importStar(require("../gcp/devConnect"));
const rm = __importStar(require("../gcp/resourceManager"));
const poller = __importStar(require("../operation-poller"));
const utils = __importStar(require("../utils"));
const error_1 = require("../error");
const prompt_1 = require("../prompt");
const getProjectNumber_1 = require("../getProjectNumber");
const api_1 = require("../api");
const fuzzy = __importStar(require("fuzzy"));
const apiv2_1 = require("../apiv2");
const githubApiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.githubApiOrigin)(), auth: false });
const APPHOSTING_CONN_PATTERN = /.+\/apphosting-github-conn-.+$/;
const CONNECTION_NAME_REGEX = /^projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/connections\/(?<id>[^\/]+)$/;
/**
 * Exported for unit testing.
 *
 * Example: /projects/my-project/locations/us-central1/connections/my-connection-id => {
 *   projectId: "my-project",
 *   location: "us-central1",
 *   id: "my-connection-id",
 * }
 */
function parseConnectionName(name) {
    const match = CONNECTION_NAME_REGEX.exec(name);
    if (!match || typeof match.groups === undefined) {
        return;
    }
    const { projectId, location, id } = match.groups;
    return {
        projectId,
        location,
        id,
    };
}
exports.parseConnectionName = parseConnectionName;
const devConnectPollerOptions = {
    apiOrigin: (0, api_1.developerConnectOrigin)(),
    apiVersion: "v1",
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
/**
 * Exported for unit testing.
 *
 * Example usage:
 * extractRepoSlugFromURI("https://github.com/user/repo.git") => "user/repo"
 */
function extractRepoSlugFromUri(cloneUri) {
    const match = /github.com\/(.+).git/.exec(cloneUri);
    if (!match) {
        return undefined;
    }
    return match[1];
}
exports.extractRepoSlugFromUri = extractRepoSlugFromUri;
/**
 * Exported for unit testing.
 *
 * Generates a repository ID.
 * The relation is 1:* between Developer Connect Connection and GitHub Repositories.
 */
function generateRepositoryId(remoteUri) {
    return extractRepoSlugFromUri(remoteUri)?.replaceAll("/", "-");
}
exports.generateRepositoryId = generateRepositoryId;
const generateConnectionId = () => {
    const randomHash = Math.random().toString(36).slice(6);
    return `apphosting-github-conn-${randomHash}`;
};
exports.generateConnectionId = generateConnectionId;
const ADD_ACCOUNT_CHOICE = "@ADD_ACCOUNT";
const MANAGE_INSTALLATION_CHOICE = "@MANAGE_INSTALLATION";
/**
 * Prompts the user to create a GitHub connection.
 */
async function getOrCreateFullyInstalledGithubConnection(projectId, location, createConnectionId) {
    utils.logBullet(clc.bold(`${clc.yellow("===")} Import a GitHub repository`));
    if (createConnectionId) {
        // Check if the connection already exists.
        try {
            const connection = await devConnect.getConnection(projectId, location, createConnectionId);
            utils.logBullet(`Reusing existing connection ${createConnectionId}`);
            return connection;
        }
        catch (err) {
            // A 404 is expected if the connection doesn't exist. Otherwise, continue to throw the err.
            if (err.status !== 404) {
                throw err;
            }
        }
    }
    // Just fetch a fully installed App Hosting connection as it would have the oauth credentials required.
    const oauthConn = await getOrCreateOauthConnection(projectId, location);
    let installationId = await promptGitHubInstallation(projectId, location, oauthConn);
    while (installationId === ADD_ACCOUNT_CHOICE) {
        utils.logBullet("Install the Firebase App Hosting GitHub app on a new account to enable access to those repositories");
        const apphostingGitHubInstallationURL = (0, api_1.apphostingGitHubAppInstallationURL)();
        utils.logBullet(apphostingGitHubInstallationURL);
        await utils.openInBrowser(apphostingGitHubInstallationURL);
        await (0, prompt_1.input)("Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.");
        installationId = await promptGitHubInstallation(projectId, location, oauthConn);
    }
    const connectionMatchingInstallation = await getConnectionForInstallation(projectId, location, installationId);
    if (connectionMatchingInstallation) {
        const { id: matchingConnectionId } = parseConnectionName(connectionMatchingInstallation.name);
        if (!createConnectionId) {
            utils.logBullet(`Reusing matching connection ${matchingConnectionId}`);
            return connectionMatchingInstallation;
        }
    }
    if (!createConnectionId) {
        createConnectionId = (0, exports.generateConnectionId)();
    }
    const connection = await createFullyInstalledConnection(projectId, location, createConnectionId, oauthConn, installationId);
    return connection;
}
exports.getOrCreateFullyInstalledGithubConnection = getOrCreateFullyInstalledGithubConnection;
/**
 * Prompts the user to link their backend to a GitHub repository.
 */
async function linkGitHubRepository(projectId, location, createConnectionId) {
    const connection = await getOrCreateFullyInstalledGithubConnection(projectId, location, createConnectionId);
    let repoCloneUri;
    do {
        if (repoCloneUri === MANAGE_INSTALLATION_CHOICE) {
            await manageInstallation(connection);
        }
        repoCloneUri = await promptCloneUri(projectId, connection);
    } while (repoCloneUri === MANAGE_INSTALLATION_CHOICE);
    const { id: connectionId } = parseConnectionName(connection.name);
    await getOrCreateConnection(projectId, location, connectionId, {
        authorizerCredential: connection.githubConfig?.authorizerCredential,
        appInstallationId: connection.githubConfig?.appInstallationId,
    });
    const repo = await getOrCreateRepository(projectId, location, connectionId, repoCloneUri);
    return repo;
}
exports.linkGitHubRepository = linkGitHubRepository;
/**
 * Creates a new DevConnect GitHub connection resource and ensures that it is fully configured on the GitHub
 * side (ie associated with an account/org and some subset of repos within that scope).
 * Copies over Oauth creds from the sentinel Oauth connection to save the user from having to
 * reauthenticate with GitHub.
 * @param projectId user's Firebase projectID
 * @param location region where backend is being created
 * @param connectionId id of connection to be created
 * @param oauthConn user's oauth connection
 * @param installationId represents an installation of the Firebase App Hosting GitHub app on a GitHub account / org
 */
async function createFullyInstalledConnection(projectId, location, connectionId, oauthConn, installationId) {
    let conn = await createConnection(projectId, location, connectionId, {
        appInstallationId: installationId,
        authorizerCredential: oauthConn.githubConfig?.authorizerCredential,
    });
    while (conn.installationState.stage !== "COMPLETE") {
        utils.logBullet("Install the Firebase App Hosting GitHub app to enable access to GitHub repositories");
        const targetUri = conn.installationState.actionUri;
        utils.logBullet(targetUri);
        await utils.openInBrowser(targetUri);
        await (0, prompt_1.input)("Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.");
        conn = await devConnect.getConnection(projectId, location, connectionId);
    }
    return conn;
}
async function manageInstallation(connection) {
    utils.logBullet("Manage the Firebase App Hosting GitHub app to enable access to GitHub repositories");
    const targetUri = connection.githubConfig?.installationUri;
    if (!targetUri) {
        throw new error_1.FirebaseError("Failed to get Installation URI. Please try again.");
    }
    utils.logBullet(targetUri);
    await utils.openInBrowser(targetUri);
    await (0, prompt_1.input)("Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.");
}
/**
 * Gets the oldest matching Dev Connect connection resource for a GitHub app installation.
 */
async function getConnectionForInstallation(projectId, location, installationId) {
    const connections = await listAppHostingConnections(projectId, location);
    const connectionsMatchingInstallation = connections.filter((conn) => conn.githubConfig?.appInstallationId === installationId);
    if (connectionsMatchingInstallation.length === 0) {
        return null;
    }
    if (connectionsMatchingInstallation.length > 1) {
        /**
         * In the Firebase Console and previous versions of the CLI we create a
         * connection and then choose an installation, which makes it possible for
         * there to be more than one connection for the same installation.
         *
         * To handle this case gracefully we return the oldest matching connection.
         */
        const sorted = devConnect.sortConnectionsByCreateTime(connectionsMatchingInstallation);
        return sorted[0];
    }
    return connectionsMatchingInstallation[0];
}
exports.getConnectionForInstallation = getConnectionForInstallation;
/**
 * Prompts the user to select which GitHub account to install the GitHub app.
 */
async function promptGitHubInstallation(projectId, location, connection) {
    const installations = await listValidInstallations(projectId, location, connection);
    const installationName = await (0, prompt_1.search)({
        message: "Which GitHub account do you want to use?",
        source: (input = "") => [
            new prompt_1.Separator(),
            {
                name: "Missing an account? Select this option to add a GitHub account",
                value: ADD_ACCOUNT_CHOICE,
            },
            new prompt_1.Separator(),
            ...fuzzy
                .filter(input, installations, {
                extract: (installation) => installation.name || "",
            })
                .map((result) => {
                return {
                    name: result.original.name || "",
                    value: result.original.id,
                };
            }),
        ],
    });
    return installationName;
}
exports.promptGitHubInstallation = promptGitHubInstallation;
/**
 * A "valid" installation is either the user's account itself or any orgs they
 * have access to that the GitHub app has been installed on.
 */
async function listValidInstallations(projectId, location, connection) {
    const { id: connId } = parseConnectionName(connection.name);
    let installations = await devConnect.fetchGitHubInstallations(projectId, location, connId);
    installations = installations.filter((installation) => {
        return ((installation.type === "user" &&
            installation.name === connection.githubConfig?.authorizerCredential?.username) ||
            installation.type === "organization");
    });
    return installations;
}
exports.listValidInstallations = listValidInstallations;
/**
 * Gets or creates the fully installed GitHub connection resource that contains our Firebase-wide GitHub Oauth token.
 * This Oauth token can be used to create other connections without reprompting the user to grant access.
 */
async function getOrCreateOauthConnection(projectId, location) {
    let conn;
    const completedConnections = await listAppHostingConnections(projectId, location);
    if (completedConnections.length > 0) {
        /**
         * any valid app hosting connection can be used, we just want the associated
         * oauth credential, don't care about the connection itself.
         * */
        return completedConnections[0];
    }
    await ensureSecretManagerAdminGrant(projectId);
    conn = await createConnection(projectId, location, (0, exports.generateConnectionId)());
    while (conn.installationState.stage === "PENDING_USER_OAUTH") {
        utils.logBullet("Please authorize the Firebase GitHub app by visiting this url:");
        const { url, cleanup } = await utils.openInBrowserPopup(conn.installationState.actionUri, "Authorize the GitHub app");
        utils.logBullet(`\t${url}`);
        await (0, prompt_1.input)("Press Enter once you have authorized the GitHub App.");
        cleanup();
        const { projectId, location, id } = parseConnectionName(conn.name);
        conn = await devConnect.getConnection(projectId, location, id);
    }
    utils.logSuccess("Connected with GitHub successfully\n");
    return conn;
}
exports.getOrCreateOauthConnection = getOrCreateOauthConnection;
async function promptCloneUri(projectId, connection) {
    const cloneUris = await fetchRepositoryCloneUris(projectId, connection);
    const cloneUri = await (0, prompt_1.search)({
        message: "Which GitHub repo do you want to deploy?",
        source: (input = "") => [
            new prompt_1.Separator(),
            {
                name: "Missing a repo? Select this option to configure your GitHub connection settings",
                value: MANAGE_INSTALLATION_CHOICE,
            },
            new prompt_1.Separator(),
            ...fuzzy
                .filter(input, cloneUris, {
                extract: (uri) => extractRepoSlugFromUri(uri) || "",
            })
                .map((result) => {
                return {
                    name: extractRepoSlugFromUri(result.original) || "",
                    value: result.original,
                };
            }),
        ],
    });
    return cloneUri;
}
/**
 * Prompts the user for a GitHub branch and validates that the given branch
 * actually exists. User is re-prompted until they enter a valid branch.
 */
async function promptGitHubBranch(repoLink) {
    const branches = await devConnect.listAllBranches(repoLink.name);
    const branch = await (0, prompt_1.search)({
        message: "Pick a branch for continuous deployment",
        source: (input = "") => [
            ...fuzzy.filter(input, Array.from(branches)).map((result) => {
                return {
                    name: result.original,
                    value: result.original,
                };
            }),
        ],
    });
    return branch;
}
exports.promptGitHubBranch = promptGitHubBranch;
/**
 * Exported for unit testing
 */
async function ensureSecretManagerAdminGrant(projectId) {
    const projectNumber = await (0, getProjectNumber_1.getProjectNumber)({ projectId });
    const dcsaEmail = devConnect.serviceAgentEmail(projectNumber);
    // will return false even if the service account does not exist in the project
    const alreadyGranted = await rm.serviceAccountHasRoles(projectId, dcsaEmail, ["roles/secretmanager.admin"], true);
    if (alreadyGranted) {
        utils.logBullet("secret manager admin role already granted");
        return;
    }
    utils.logBullet("To create a new GitHub connection, Secret Manager Admin role (roles/secretmanager.admin) is required on the Developer Connect Service Agent.");
    const grant = await (0, prompt_1.confirm)("Grant the required role to the Developer Connect Service Agent?");
    if (!grant) {
        utils.logBullet("You, or your project administrator, should run the following command to grant the required role:\n\n" +
            "You, or your project adminstrator, can run the following command to grant the required role manually:\n\n" +
            `\tgcloud projects add-iam-policy-binding ${projectId} \\\n` +
            `\t  --member="serviceAccount:${dcsaEmail} \\\n` +
            `\t  --role="roles/secretmanager.admin\n`);
        throw new error_1.FirebaseError("Insufficient IAM permissions to create a new connection to GitHub");
    }
    try {
        await rm.addServiceAccountToRoles(projectId, dcsaEmail, ["roles/secretmanager.admin"], 
        /* skipAccountLookup= */ true);
    }
    catch (e) {
        // if the dev connect P4SA doesn't exist in the project, generate one
        if (e?.code === 400 || e?.status === 400) {
            await devConnect.generateP4SA(projectNumber);
            await rm.addServiceAccountToRoles(projectId, dcsaEmail, ["roles/secretmanager.admin"], 
            /* skipAccountLookup= */ true);
        }
        else {
            throw e;
        }
    }
    utils.logSuccess("Successfully granted the required role to the Developer Connect Service Agent!\n");
}
exports.ensureSecretManagerAdminGrant = ensureSecretManagerAdminGrant;
/**
 * Creates a new Developer Connect Connection resource. Will typically need some initialization
 * or configuration after being created.
 */
async function createConnection(projectId, location, connectionId, githubConfig) {
    const op = await devConnect.createConnection(projectId, location, connectionId, githubConfig);
    const conn = await poller.pollOperation({
        ...devConnectPollerOptions,
        pollerName: `create-${location}-${connectionId}`,
        operationResourceName: op.name,
    });
    return conn;
}
exports.createConnection = createConnection;
/**
 * Gets or creates a new Developer Connect Connection resource. Will typically need some initialization
 * Exported for unit testing.
 */
async function getOrCreateConnection(projectId, location, connectionId, githubConfig) {
    let conn;
    try {
        conn = await devConnect.getConnection(projectId, location, connectionId);
    }
    catch (err) {
        if (err.status === 404) {
            utils.logBullet("creating connection");
            conn = await createConnection(projectId, location, connectionId, githubConfig);
        }
        else {
            throw err;
        }
    }
    return conn;
}
exports.getOrCreateConnection = getOrCreateConnection;
/**
 * Gets or creates a new Developer Connect GitRepositoryLink resource on a Developer Connect connection.
 * Exported for unit testing.
 */
async function getOrCreateRepository(projectId, location, connectionId, cloneUri) {
    const repositoryId = generateRepositoryId(cloneUri);
    if (!repositoryId) {
        throw new error_1.FirebaseError(`Failed to generate repositoryId for URI "${cloneUri}".`);
    }
    let repo;
    try {
        repo = await devConnect.getGitRepositoryLink(projectId, location, connectionId, repositoryId);
    }
    catch (err) {
        if (err.status === 404) {
            const op = await devConnect.createGitRepositoryLink(projectId, location, connectionId, repositoryId, cloneUri);
            repo = await poller.pollOperation({
                ...devConnectPollerOptions,
                pollerName: `create-${location}-${connectionId}-${repositoryId}`,
                operationResourceName: op.name,
            });
        }
        else {
            throw err;
        }
    }
    return repo;
}
exports.getOrCreateRepository = getOrCreateRepository;
/**
 * Lists all App Hosting Developer Connect Connections
 * not including the OAuth Connection
 *
 * Exported for unit testing.
 */
async function listAppHostingConnections(projectId, location) {
    const conns = await devConnect.listAllConnections(projectId, location);
    return conns.filter((conn) => APPHOSTING_CONN_PATTERN.test(conn.name) &&
        conn.installationState.stage === "COMPLETE" &&
        !conn.disabled);
}
exports.listAppHostingConnections = listAppHostingConnections;
/**
 * Fetch the git clone url using a Developer Connect GitRepositoryLink.
 *
 * Exported for unit testing.
 */
async function fetchRepositoryCloneUris(projectId, connection) {
    const { location, id } = parseConnectionName(connection.name);
    const connectionRepos = await devConnect.listAllLinkableGitRepositories(projectId, location, id);
    const cloneUris = connectionRepos.map((conn) => conn.cloneUri);
    return cloneUris;
}
exports.fetchRepositoryCloneUris = fetchRepositoryCloneUris;
/**
 * Gets the details of a GitHub branch from the GitHub REST API.
 */
async function getGitHubBranch(owner, repo, branch, readToken) {
    const headers = { Authorization: `Bearer ${readToken}`, "User-Agent": "Firebase CLI" };
    const { body } = await githubApiClient.get(`/repos/${owner}/${repo}/branches/${branch}`, {
        headers,
    });
    return body;
}
exports.getGitHubBranch = getGitHubBranch;
/**
 * Gets the details of a GitHub commit from the GitHub REST API.
 */
async function getGitHubCommit(owner, repo, ref, readToken) {
    const headers = { Authorization: `Bearer ${readToken}`, "User-Agent": "Firebase CLI" };
    const { body } = await githubApiClient.get(`/repos/${owner}/${repo}/commits/${ref}`, {
        headers,
    });
    return body;
}
exports.getGitHubCommit = getGitHubCommit;
//# sourceMappingURL=githubConnections.js.map