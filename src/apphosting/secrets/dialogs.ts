import * as clc from "colorette";
const Table = require("cli-table");

import * as apphosting from "../../gcp/apphosting";
import * as prompt from "../../prompt";
import * as iam from "../../gcp/iam";
import * as utils from "../../utils";
import { logger } from "../../logger";

interface Metadata { location: string, id: string, accounts: string[] };

export function serviceAccountsForBackend(projectNumber: string, backend: apphosting.Backend): string[] {
    if (backend.serviceAccount) {
        return [backend.serviceAccount];
    }
    return [iam.getDefaultCloudBuildServiceAgent(projectNumber), iam.getDefaultComputeEngineServiceAgent(projectNumber)];
}

export function toMetadata(projectNumber: string, backends: apphosting.Backend[]): Metadata[] {
    const metadata: Metadata[] = [];
    for (const backend of backends) {
        const [,,,location,,id] = backend.name.split("/");
        metadata.push({ location, id, accounts:  serviceAccountsForBackend(projectNumber, backend) });
    }
    return metadata.sort((left, right) => {
        const cmplocation = left.location.localeCompare(right.location);
        if (cmplocation) {
            return cmplocation;
        }
        return left.id.localeCompare(right.id);
    });
}

export function tableForBackends(metadata: Metadata[]): [headers: string[], rows: string[][]] {
    const headers = ["location", "backend", metadata.findIndex(val => val.accounts.length > 1) === -1 ? "service account" : "service accounts"];
    const rows = metadata.map(m => [m.location, m.id, m.accounts.join(", ")]);
    return [headers, rows];
}

export const WARN_NO_BACKENDS = 
    "To use this secret, your backend's service account must have secret accessor permission. " +
    "It does not look like you have a backend yet. After creating a backend, grant access with " +
    clc.bold("firebase apphosting:secrets:grantAccess");

export const GRANT_ACCESS_IN_FUTURE = `To grant access in the future, run ${clc.bold("firebase apphosting:secrets:grantaccess")}`;

export async function selectBackendServiceAccounts(projectNumber: string, projectId: string, options: any): Promise<string[]> {
    const listBackends = await apphosting.listBackends(projectId, "-")

    if (listBackends.unreachable.length) {
        utils.logLabeledWarning(
            "apphosting",
            `Could not reach location(s) ${listBackends.unreachable.join(", ")}. You may need to run ` +
            `${clc.bold("firebase apphosting:secrets:grantAccess")} at a later time if you have backends in these locations`,
            );
    }

    if (!listBackends.backends.length) {
        utils.logLabeledWarning( "apphosting", WARN_NO_BACKENDS);
        return [];
    }

    if (listBackends.backends.length === 1) {
        const grant = await prompt.confirm({
            nonInteractive: options.nonInteractive,
            default: true,
            message: "To use this secret, your backend's service account must have secret accessor permission. Would you like to grant it now?"
        });
        if (grant) {
            return serviceAccountsForBackend(projectNumber, listBackends.backends[0]);
        }
        utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
        return [];
    }

    let metadata: Metadata[] = toMetadata(projectNumber, listBackends.backends);

    // Use JSON.stringify because deep copmarison is annoying in JS. Because the order of the service account list should be deterinistic,
    // this shouldn't need a sort command.
    const test = JSON.stringify(metadata[0].accounts);
    const allSharedAccounts = metadata.every((val) => JSON.stringify(val.accounts) === test);
    if (allSharedAccounts) {
        const grant = await prompt.confirm({
            nonInteractive: options.nonInteractive,
            default: true,
            message: "To use this secret, your backend's service account must have secret accessor permission. All of your backends use " +
                (metadata[0].accounts.length === 1 ? `service account ${metadata[0].accounts[0]}` : `service accounts ${metadata[0].accounts.join(", ")}`) +
                ". Granting access to one backend will grant access to all backends. Would you like to grant it now?"
        });
        if (grant) {
            return metadata[0].accounts;
        }
        utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
        return [];
    }

    utils.logLabeledBullet(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. Your backends use the following service accounts:");
    const tableData = tableForBackends(metadata);
    const table = new Table({
        head: tableData[0],
        style: { head: ["green"] },
        rows: tableData[1],
    });
    logger.info(table.toString());

    const allAccounts = metadata.reduce((accum: Set<string>, row) => {
        row.accounts.forEach(sa => accum.add(sa))
        return accum;
    }, new Set<string>());
    const chosen = await prompt.promptOnce({
        type: "checkbox",
        message: "Which service accounts would you like to grant access? "+
            "Press Space to select accounts, then Enter to confirm your choices.",
        choices: [...allAccounts.values()].sort(),
    });
    if (!chosen.length) {
        utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
    }
    return chosen;
}
