import * as clc from "colorette";
const Table = require("cli-table");

import { serviceAccountsForBackend } from ".";
import * as apphosting from "../../gcp/apphosting";
import * as prompt from "../../prompt";
import * as utils from "../../utils";
import { logger } from "../../logger";

// TODO: Consider moving some of this into a common utility
import * as env from "../../functions/env";

interface BackendMetadata {
  location: string;
  id: string;
  serviceAccounts: string[];
}

/**
 * Creates sorted BackendMetadata for a list of Backends.
 */
export function toMetadata(
  projectNumber: string,
  backends: apphosting.Backend[],
): BackendMetadata[] {
  const metadata: BackendMetadata[] = [];
  for (const backend of backends) {
    // Splits format projects/<unused>/locations/<location>/backends/<id>
    const [, , , location, , id] = backend.name.split("/");
    metadata.push({ location, id, serviceAccounts: serviceAccountsForBackend(projectNumber, backend) });
  }
  return metadata.sort((left, right) => {
    const cmplocation = left.location.localeCompare(right.location);
    if (cmplocation) {
      return cmplocation;
    }
    return left.id.localeCompare(right.id);
  });
}

const matchesServiceAccounts = (target: BackendMetadata) => (test: BackendMetadata) => {
  return target.serviceAccounts.length === test.serviceAccounts.length && target.serviceAccounts.every(sa => test.serviceAccounts.indexOf(sa) != -1);
};

/**
 * Given a list of BackendMetadata, creates the JSON necessary to power a cli table.
 * @returns a tuple where the first element is column names and the second element is rows.
 */
export function tableForBackends(
  metadata: BackendMetadata[],
): [headers: string[], rows: string[][]] {
  const headers = [
    "location",
    "backend",
    metadata.every(m => m.serviceAccounts.length === 1) ? "service account" : "service accounts",
  ];
  const rows = metadata.map((m) => [m.location, m.id, m.serviceAccounts.join(", ")]);
  return [headers, rows];
}

/** Common warning log that there are no backends. Exported to make tests easier. */
export const WARN_NO_BACKENDS =
  "To use this secret, your backend's service account must have secret accessor permission. " +
  "It does not look like you have a backend yet. After creating a backend, grant access with " +
  clc.bold("firebase apphosting:secrets:grantAccess");

/** Common warning log that the user will need to grant access manually. Exported to make tests easier. */
export const GRANT_ACCESS_IN_FUTURE = `To grant access in the future, run ${clc.bold("firebase apphosting:secrets:grantaccess")}`;

/**
 * Create a dialog where customers can choose a series of service accounts to grant access.
 * Can return an empty array of the user opts out of granting access.
 */
export async function selectBackendServiceAccounts(
  projectNumber: string,
  projectId: string,
  options: any,
): Promise<string[]> {
  const listBackends = await apphosting.listBackends(projectId, "-");

  if (listBackends.unreachable.length) {
    utils.logLabeledWarning(
      "apphosting",
      `Could not reach location(s) ${listBackends.unreachable.join(", ")}. You may need to run ` +
        `${clc.bold("firebase apphosting:secrets:grantAccess")} at a later time if you have backends in these locations`,
    );
  }

  if (!listBackends.backends.length) {
    utils.logLabeledWarning("apphosting", WARN_NO_BACKENDS);
    return [];
  }

  if (listBackends.backends.length === 1) {
    const grant = await prompt.confirm({
      nonInteractive: options.nonInteractive,
      default: true,
      message:
        "To use this secret, your backend's service account must have secret accessor permission. Would you like to grant it now?",
    });
    if (grant) {
      return serviceAccountsForBackend(projectNumber, listBackends.backends[0]);
    }
    utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
    return [];
  }

  const metadata: BackendMetadata[] = toMetadata(projectNumber, listBackends.backends);

  if (metadata.every(matchesServiceAccounts(metadata[0]))) {
    utils.logLabeledBullet(
      "apphosting",
      "To use this secret, your backend's service account must have secret accessor permission. All of your backends use " +
        (metadata[0].serviceAccounts.length === 1 ? "service account " : "service accounts ") +
        metadata[0].serviceAccounts.join(", ") + ". Granting access to one backend will grant access to all backends.",
    );
    const grant = await prompt.confirm({
      nonInteractive: options.nonInteractive,
      default: true,
      message: "Would you like to grant it now?",
    });
    if (grant) {
      return metadata[0].serviceAccounts;
    }
    utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
    return [];
  }

  utils.logLabeledBullet(
    "apphosting",
    "To use this secret, your backend's service account must have secret accessor permission. Your backends use the following service accounts:",
  );
  const tableData = tableForBackends(metadata);
  const table = new Table({
    head: tableData[0],
    style: { head: ["green"] },
    rows: tableData[1],
  });
  logger.info(table.toString());

  const allAccounts = metadata.reduce((accum: Set<string>, row) => {
    for (const sa of row.serviceAccounts) {
      accum.add(sa);
    }
    return accum;
  }, new Set<string>());
  const chosen = await prompt.promptOnce({
    type: "checkbox",
    message:
      "Which service accounts would you like to grant access? " +
      "Press Space to select accounts, then Enter to confirm your choices.",
    choices: [...allAccounts.values()].sort(),
  });
  if (!chosen.length) {
    utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
  }
  return chosen;
}

function toUpperSnakeCase(key: string): string {
  return key
    .replace(/[.-]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

export async function envVarForSecret(secret: string): Promise<string> {
  const upper = toUpperSnakeCase(secret);
  if (upper === secret) {
    try {
      env.validateKey(secret);
      return secret;
    } catch {
      // fallthrough
    }
  }

  do {
    const test = await prompt.promptOnce({
      message: "What environment variable name would you like to use?",
      default: upper,
    });

    try {
      env.validateKey(test);
      return test;
    } catch (err) {
      utils.logLabeledError("apphosting", (err as env.KeyValidationError).message);
    }
  } while (true);
}
