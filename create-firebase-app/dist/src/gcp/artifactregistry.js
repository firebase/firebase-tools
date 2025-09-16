"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRepository = exports.getRepository = exports.deletePackage = exports.ensureApiEnabled = exports.API_VERSION = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const metaprogramming_1 = require("../metaprogramming");
const api = require("../ensureApiEnabled");
const proto = require("./proto");
exports.API_VERSION = "v1";
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.artifactRegistryDomain)(),
    auth: true,
    apiVersion: exports.API_VERSION,
});
function ensureApiEnabled(projectId) {
    return api.ensure(projectId, (0, api_1.artifactRegistryDomain)(), "artifactregistry", true);
}
exports.ensureApiEnabled = ensureApiEnabled;
// This line caues a compile-time error if RepositoryOutputOnlyFields has a field that is
// missing in Repository or incompatible with the type in Repository.
(0, metaprogramming_1.assertImplements)();
/** Delete a package. */
async function deletePackage(name) {
    const res = await client.delete(name);
    return res.body;
}
exports.deletePackage = deletePackage;
/**
 * Get a repository from Artifact Registry.
 */
async function getRepository(repoPath) {
    const res = await client.get(repoPath);
    return res.body;
}
exports.getRepository = getRepository;
/**
 * Update an Artifact Registry repository.
 */
async function updateRepository(repo) {
    const updateMask = proto.fieldMasks(repo, "cleanupPolicies", "cleanupPolicyDryRun", "labels");
    if (updateMask.length === 0) {
        const res = await client.get(repo.name);
        return res.body;
    }
    const res = await client.patch(`/${repo.name}`, repo, {
        queryParams: { updateMask: updateMask.join(",") },
    });
    return res.body;
}
exports.updateRepository = updateRepository;
