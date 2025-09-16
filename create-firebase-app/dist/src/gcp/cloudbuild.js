"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultServiceAgent = exports.getDefaultServiceAccount = exports.deleteRepository = exports.getRepository = exports.createRepository = exports.fetchLinkableRepositories = exports.deleteConnection = exports.listConnections = exports.getConnection = exports.createConnection = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const PAGE_SIZE_MAX = 100;
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.cloudbuildOrigin)(),
    auth: true,
    apiVersion: "v2",
});
/**
 * Creates a Cloud Build V2 Connection.
 */
async function createConnection(projectId, location, connectionId, githubConfig = {}) {
    const res = await client.post(`projects/${projectId}/locations/${location}/connections`, { githubConfig }, { queryParams: { connectionId } });
    return res.body;
}
exports.createConnection = createConnection;
/**
 * Gets metadata for a Cloud Build V2 Connection.
 */
async function getConnection(projectId, location, connectionId) {
    const name = `projects/${projectId}/locations/${location}/connections/${connectionId}`;
    const res = await client.get(name);
    return res.body;
}
exports.getConnection = getConnection;
/**
 * List metadata for a Cloud Build V2 Connection.
 */
async function listConnections(projectId, location) {
    const conns = [];
    const getNextPage = async (pageToken = "") => {
        const res = await client.get(`/projects/${projectId}/locations/${location}/connections`, {
            queryParams: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.connections)) {
            conns.push(...res.body.connections);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return conns;
}
exports.listConnections = listConnections;
/**
 * Deletes a Cloud Build V2 Connection.
 */
async function deleteConnection(projectId, location, connectionId) {
    const name = `projects/${projectId}/locations/${location}/connections/${connectionId}`;
    const res = await client.delete(name);
    return res.body;
}
exports.deleteConnection = deleteConnection;
/**
 * Gets a list of repositories that can be added to the provided Connection.
 */
async function fetchLinkableRepositories(projectId, location, connectionId, pageToken = "", pageSize = 1000) {
    const name = `projects/${projectId}/locations/${location}/connections/${connectionId}:fetchLinkableRepositories`;
    const res = await client.get(name, {
        queryParams: {
            pageSize,
            pageToken,
        },
    });
    return res.body;
}
exports.fetchLinkableRepositories = fetchLinkableRepositories;
/**
 * Creates a Cloud Build V2 Repository.
 */
async function createRepository(projectId, location, connectionId, repositoryId, remoteUri) {
    const res = await client.post(`projects/${projectId}/locations/${location}/connections/${connectionId}/repositories`, { remoteUri }, { queryParams: { repositoryId } });
    return res.body;
}
exports.createRepository = createRepository;
/**
 * Gets metadata for a Cloud Build V2 Repository.
 */
async function getRepository(projectId, location, connectionId, repositoryId) {
    const name = `projects/${projectId}/locations/${location}/connections/${connectionId}/repositories/${repositoryId}`;
    const res = await client.get(name);
    return res.body;
}
exports.getRepository = getRepository;
/**
 * Deletes a Cloud Build V2 Repository.
 */
async function deleteRepository(projectId, location, connectionId, repositoryId) {
    const name = `projects/${projectId}/locations/${location}/connections/${connectionId}/repositories/${repositoryId}`;
    const res = await client.delete(name);
    return res.body;
}
exports.deleteRepository = deleteRepository;
/**
 * Returns the service account created by Cloud Build to use as a default in Cloud Build jobs.
 * This service account is deprecated and future users should bring their own account.
 */
function getDefaultServiceAccount(projectNumber) {
    return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}
exports.getDefaultServiceAccount = getDefaultServiceAccount;
/**
 * Returns the default cloud build service agent.
 * This is the account that Cloud Build itself uses when performing operations on the user's behalf.
 */
function getDefaultServiceAgent(projectNumber) {
    return `service-${projectNumber}@gcp-sa-cloudbuild.iam.gserviceaccount.com`;
}
exports.getDefaultServiceAgent = getDefaultServiceAgent;
