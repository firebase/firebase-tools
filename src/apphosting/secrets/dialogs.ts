import * as clc from "colorette";
import * as Table from "cli-table3";

import { MultiServiceAccounts, ServiceAccounts, serviceAccountsForBackend, toMulti } from ".";
import * as apphosting from "../../gcp/apphosting";
import * as prompt from "../../prompt";
import * as utils from "../../utils";
import { logger } from "../../logger";

// TODO: Consider moving some of this into a common utility
import * as env from "../../functions/env";

interface BackendMetadata {
  location: string;
  id: string;
  buildServiceAccount: string;
  runServiceAccount: string;
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
    metadata.push({ location, id, ...serviceAccountsForBackend(projectNumber, backend) });
  }
  return metadata.sort((left, right) => {
    const cmplocation = left.location.localeCompare(right.location);
    if (cmplocation) {
      return cmplocation;
    }
    return left.id.localeCompare(right.id);
  });
}

/** Displays a single service account or a comma separated list of service accounts. */
export function serviceAccountDisplay(metadata: ServiceAccounts): string {
  if (sameServiceAccount(metadata)) {
    return metadata.runServiceAccount;
  }
  return `${metadata.buildServiceAccount}, ${metadata.runServiceAccount}`;
}

function sameServiceAccount(metadata: ServiceAccounts): boolean {
  return metadata.buildServiceAccount === metadata.runServiceAccount;
}

const matchesServiceAccounts = (target: ServiceAccounts) => (test: ServiceAccounts) => {
  return (
    target.buildServiceAccount === test.buildServiceAccount &&
    target.runServiceAccount === test.runServiceAccount
  );
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
    metadata.every(sameServiceAccount) ? "service account" : "service accounts",
  ];
  const rows = metadata.map((m) => [m.location, m.id, serviceAccountDisplay(m)]);
  return [headers, rows];
}

/**
 * Returns a MultiServiceAccounts for all selected service accounts in a ServiceAccount[].
 * If a service account is ever a "build" account in input, it will be a "build" account in the
 * output. Otherwise, it will be a "run" account.
 */
export function selectFromMetadata(
  input: ServiceAccounts[],
  selected: string[],
): MultiServiceAccounts {
  const buildAccounts = new Set<string>();
  const runAccounts = new Set<string>();

  for (const sa of selected) {
    if (input.find((m) => m.buildServiceAccount === sa)) {
      buildAccounts.add(sa);
    } else {
      runAccounts.add(sa);
    }
  }

  return {
    buildServiceAccounts: [...buildAccounts],
    runServiceAccounts: [...runAccounts],
  };
}

/** Common warning log that there are no backends. Exported to make tests easier. */
export const WARN_NO_BACKENDS =
  "To use this secret, your backend's service account must be granted access." +
  "It does not look like you have a backend yet. After creating a backend, grant access with " +
  clc.bold("firebase apphosting:secrets:grantaccess");

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
): Promise<MultiServiceAccounts> {
  const listBackends = await apphosting.listBackends(projectId, "-");

  if (listBackends.unreachable.length) {
    utils.logWarning(
      `Could not reach location(s) ${listBackends.unreachable.join(", ")}. You may need to run ` +
        `${clc.bold("firebase apphosting:secrets:grantaccess")} at a later time if you have backends in these locations`,
    );
  }

  if (!listBackends.backends.length) {
    utils.logWarning(WARN_NO_BACKENDS);
    return { buildServiceAccounts: [], runServiceAccounts: [] };
  }

  if (listBackends.backends.length === 1) {
    const grant = await prompt.confirm({
      nonInteractive: options.nonInteractive,
      default: true,
      message:
        "To use this secret, your backend's service account must be granted access. Would you like to grant access now?",
    });
    if (grant) {
      return toMulti(serviceAccountsForBackend(projectNumber, listBackends.backends[0]));
    }
    utils.logBullet(GRANT_ACCESS_IN_FUTURE);
    return { buildServiceAccounts: [], runServiceAccounts: [] };
  }

  const metadata: BackendMetadata[] = toMetadata(projectNumber, listBackends.backends);

  if (metadata.every(matchesServiceAccounts(metadata[0]))) {
    utils.logBullet("To use this secret, your backend's service account must be granted access.");
    utils.logBullet(
      "All of your backends share the following " +
        (sameServiceAccount(metadata[0]) ? "service account: " : "service accounts: ") +
        serviceAccountDisplay(metadata[0]) +
        ".\nGranting access to one backend will grant access to all backends.",
    );
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
    utils.logBullet(GRANT_ACCESS_IN_FUTURE);
    return { buildServiceAccounts: [], runServiceAccounts: [] };
  }

  utils.logBullet(
    "To use this secret, your backend's service account must be granted access. Your backends use the following service accounts:",
  );
  const tableData = tableForBackends(metadata);
  const table = new Table({
    head: tableData[0],
    style: { head: ["green"] },
  });
  table.push(...tableData[1]);
  logger.info(table.toString());

  const allAccounts = metadata.reduce((accum: Set<string>, row) => {
    accum.add(row.buildServiceAccount);
    accum.add(row.runServiceAccount);
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
    utils.logBullet(GRANT_ACCESS_IN_FUTURE);
  }
  return selectFromMetadata(metadata, chosen);
}

function toUpperSnakeCase(key: string): string {
  return key
    .replace(/[.-]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

export async function envVarForSecret(
  secret: string,
  trimTestPrefix: boolean = false,
): Promise<string> {
  let upper = toUpperSnakeCase(secret);
  if (trimTestPrefix && upper.startsWith("TEST_")) {
    upper = upper.substring("TEST_".length);
  }
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
