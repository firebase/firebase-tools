"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envVarForSecret = exports.selectBackendServiceAccounts = exports.GRANT_ACCESS_IN_FUTURE = exports.WARN_NO_BACKENDS = exports.selectFromMetadata = exports.tableForBackends = exports.serviceAccountDisplay = exports.toMetadata = void 0;
const clc = require("colorette");
const Table = require("cli-table3");
const _1 = require(".");
const apphosting = require("../../gcp/apphosting");
const prompt = require("../../prompt");
const utils = require("../../utils");
const logger_1 = require("../../logger");
// TODO: Consider moving some of this into a common utility
const env = require("../../functions/env");
/**
 * Creates sorted BackendMetadata for a list of Backends.
 */
async function toMetadata(projectNumber, backends) {
    const metadata = [];
    for (const backend of backends) {
        // Splits format projects/<unused>/locations/<location>/backends/<id>
        const [, , , location, , id] = backend.name.split("/");
        metadata.push(Object.assign({ location, id }, (await (0, _1.serviceAccountsForBackend)(projectNumber, backend))));
    }
    return metadata.sort((left, right) => {
        const cmplocation = left.location.localeCompare(right.location);
        if (cmplocation) {
            return cmplocation;
        }
        return left.id.localeCompare(right.id);
    });
}
exports.toMetadata = toMetadata;
/** Displays a single service account or a comma separated list of service accounts. */
function serviceAccountDisplay(metadata) {
    if (sameServiceAccount(metadata)) {
        return metadata.runServiceAccount;
    }
    return `${metadata.buildServiceAccount}, ${metadata.runServiceAccount}`;
}
exports.serviceAccountDisplay = serviceAccountDisplay;
function sameServiceAccount(metadata) {
    return metadata.buildServiceAccount === metadata.runServiceAccount;
}
const matchesServiceAccounts = (target) => (test) => {
    return (target.buildServiceAccount === test.buildServiceAccount &&
        target.runServiceAccount === test.runServiceAccount);
};
/**
 * Given a list of BackendMetadata, creates the JSON necessary to power a cli table.
 * @returns a tuple where the first element is column names and the second element is rows.
 */
function tableForBackends(metadata) {
    const headers = [
        "location",
        "backend",
        metadata.every(sameServiceAccount) ? "service account" : "service accounts",
    ];
    const rows = metadata.map((m) => [m.location, m.id, serviceAccountDisplay(m)]);
    return [headers, rows];
}
exports.tableForBackends = tableForBackends;
/**
 * Returns a MultiServiceAccounts for all selected service accounts in a ServiceAccount[].
 * If a service account is ever a "build" account in input, it will be a "build" account in the
 * output. Otherwise, it will be a "run" account.
 */
function selectFromMetadata(input, selected) {
    const buildAccounts = new Set();
    const runAccounts = new Set();
    for (const sa of selected) {
        if (input.find((m) => m.buildServiceAccount === sa)) {
            buildAccounts.add(sa);
        }
        else {
            runAccounts.add(sa);
        }
    }
    return {
        buildServiceAccounts: [...buildAccounts],
        runServiceAccounts: [...runAccounts],
    };
}
exports.selectFromMetadata = selectFromMetadata;
/** Common warning log that there are no backends. Exported to make tests easier. */
exports.WARN_NO_BACKENDS = "To use this secret, your backend's service account must be granted access." +
    "It does not look like you have a backend yet. After creating a backend, grant access with " +
    clc.bold("firebase apphosting:secrets:grantaccess");
/** Common warning log that the user will need to grant access manually. Exported to make tests easier. */
exports.GRANT_ACCESS_IN_FUTURE = `To grant access in the future, run ${clc.bold("firebase apphosting:secrets:grantaccess")}`;
/**
 * Create a dialog where customers can choose a series of service accounts to grant access.
 * Can return an empty array of the user opts out of granting access.
 */
async function selectBackendServiceAccounts(projectNumber, projectId, options) {
    const listBackends = await apphosting.listBackends(projectId, "-");
    if (listBackends.unreachable.length) {
        utils.logWarning(`Could not reach location(s) ${listBackends.unreachable.join(", ")}. You may need to run ` +
            `${clc.bold("firebase apphosting:secrets:grantaccess")} at a later time if you have backends in these locations`);
    }
    if (!listBackends.backends.length) {
        utils.logWarning(exports.WARN_NO_BACKENDS);
        return { buildServiceAccounts: [], runServiceAccounts: [] };
    }
    if (listBackends.backends.length === 1) {
        const grant = await prompt.confirm({
            nonInteractive: options.nonInteractive,
            default: true,
            message: "To use this secret, your backend's service account must be granted access. Would you like to grant access now?",
        });
        if (grant) {
            return (0, _1.toMulti)(await (0, _1.serviceAccountsForBackend)(projectNumber, listBackends.backends[0]));
        }
        utils.logBullet(exports.GRANT_ACCESS_IN_FUTURE);
        return { buildServiceAccounts: [], runServiceAccounts: [] };
    }
    const metadata = await toMetadata(projectNumber, listBackends.backends);
    if (metadata.every(matchesServiceAccounts(metadata[0]))) {
        utils.logBullet("To use this secret, your backend's service account must be granted access.");
        utils.logBullet("All of your backends share the following " +
            (sameServiceAccount(metadata[0]) ? "service account: " : "service accounts: ") +
            serviceAccountDisplay(metadata[0]) +
            ".\nGranting access to one backend will grant access to all backends.");
        const grant = await prompt.confirm({
            nonInteractive: options.nonInteractive,
            default: true,
            message: "Would you like to grant access to all backends now?",
        });
        if (grant) {
            return selectFromMetadata(metadata, [
                metadata[0].buildServiceAccount,
                metadata[0].runServiceAccount,
            ]);
        }
        utils.logBullet(exports.GRANT_ACCESS_IN_FUTURE);
        return { buildServiceAccounts: [], runServiceAccounts: [] };
    }
    utils.logBullet("To use this secret, your backend's service account must be granted access. Your backends use the following service accounts:");
    const tableData = tableForBackends(metadata);
    const table = new Table({
        head: tableData[0],
        style: { head: ["green"] },
    });
    table.push(...tableData[1]);
    logger_1.logger.info(table.toString());
    const allAccounts = metadata.reduce((accum, row) => {
        accum.add(row.buildServiceAccount);
        accum.add(row.runServiceAccount);
        return accum;
    }, new Set());
    const chosen = await prompt.checkbox({
        message: "Which service accounts would you like to grant access? " +
            "Press Space to select accounts, then Enter to confirm your choices.",
        choices: [...allAccounts.values()].sort(),
    });
    if (!chosen.length) {
        utils.logBullet(exports.GRANT_ACCESS_IN_FUTURE);
    }
    return selectFromMetadata(metadata, chosen);
}
exports.selectBackendServiceAccounts = selectBackendServiceAccounts;
function toUpperSnakeCase(key) {
    return key
        .replace(/[.-]/g, "_")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase();
}
async function envVarForSecret(secret, trimTestPrefix = false) {
    let upper = toUpperSnakeCase(secret);
    if (trimTestPrefix && upper.startsWith("TEST_")) {
        upper = upper.substring("TEST_".length);
    }
    if (upper === secret) {
        try {
            env.validateKey(secret);
            return secret;
        }
        catch (_a) {
            // fallthrough
        }
    }
    do {
        const test = await prompt.input({
            message: "What environment variable name would you like to use?",
            default: upper,
        });
        try {
            env.validateKey(test);
            return test;
        }
        catch (err) {
            utils.logLabeledError("apphosting", err.message);
        }
    } while (true);
}
exports.envVarForSecret = envVarForSecret;
