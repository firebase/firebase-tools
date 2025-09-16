"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEndpointHash = exports.getSecretsHash = exports.getSourceHash = exports.getEnvironmentVariablesHash = void 0;
const promises_1 = require("node:fs/promises");
const crypto = require("crypto");
const secrets_1 = require("../../../functions/secrets");
/**
 * Generates a hash from the environment variables of a {@link Backend}.
 * @param backend Backend of a set of functions
 */
function getEnvironmentVariablesHash(backend) {
    // Hash the contents of the dotenv variables
    return createHash(JSON.stringify(backend.environmentVariables || {}));
}
exports.getEnvironmentVariablesHash = getEnvironmentVariablesHash;
/**
 * Retrieves the unique hash given a pathToFile.
 * @param pathToFile Packaged file contents of functions
 */
async function getSourceHash(pathToFile) {
    // Hash the contents of a file, ignoring metadata.
    // Excluding metadata in the hash is important because some
    // files are dynamically generated on deploy.
    const data = await (0, promises_1.readFile)(pathToFile);
    return createHash(data);
}
exports.getSourceHash = getSourceHash;
/**
 * Retrieves a hash generated from the secrets of an {@link Endpoint}.
 * @param endpoint Endpoint
 */
function getSecretsHash(endpoint) {
    // Hash the secret versions.
    const secretVersions = (0, secrets_1.getSecretVersions)(endpoint);
    return createHash(JSON.stringify(secretVersions || {}));
}
exports.getSecretsHash = getSecretsHash;
/**
 * Generates a unique hash derived from the hashes generated from the
 * package source, environment variables, and endpoint secrets.
 * @param sourceHash
 * @param envHash
 * @param secretsHash
 */
function getEndpointHash(sourceHash, envHash, secretsHash) {
    const combined = [sourceHash, envHash, secretsHash].filter((hash) => !!hash).join("");
    return createHash(combined);
}
exports.getEndpointHash = getEndpointHash;
// Helper method to create hashes consistently
function createHash(data, algorithm = "sha1") {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest("hex");
}
