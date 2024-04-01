import * as clc from "colorette";
const Table = require("cli-table");

import { MultiServiceAccounts, ServiceAccounts, serviceAccountsForBackend, toMulti } from ".";
import * as apphosting from "../../gcp/apphosting";
import * as prompt from "../../prompt";
import * as utils from "../../utils";
import { logger } from "../../logger";

interface BackendMetadata {
  location: string;
  id: string;
  build: string;
  run: string;
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
    return metadata.run;
  }
  return `${metadata.build}, ${metadata.run}`;
}

function sameServiceAccount(metadata: ServiceAccounts): boolean {
  return metadata.build === metadata.run;
}

const matchesServiceAccounts = (target: ServiceAccounts) => (test: ServiceAccounts) => {
  return target.build === test.build && target.run === test.run;
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
    if (input.find((m) => m.build === sa)) {
      buildAccounts.add(sa);
    } else {
      runAccounts.add(sa);
    }
  }

  return {
    build: [...buildAccounts],
    run: [...runAccounts],
  };
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
): Promise<MultiServiceAccounts> {
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
    return { build: [], run: [] };
  }

  if (listBackends.backends.length === 1) {
    const grant = await prompt.confirm({
      nonInteractive: options.nonInteractive,
      default: true,
      message:
        "To use this secret, your backend's service account must have secret accessor permission. Would you like to grant it now?",
    });
    if (grant) {
      return toMulti(serviceAccountsForBackend(projectNumber, listBackends.backends[0]));
    }
    utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
    return { build: [], run: [] };
  }

  const metadata: BackendMetadata[] = toMetadata(projectNumber, listBackends.backends);

  if (metadata.every(matchesServiceAccounts(metadata[0]))) {
    const grant = await prompt.confirm({
      nonInteractive: options.nonInteractive,
      default: true,
      message:
        "To use this secret, your backend's service account must have secret accessor permission. All of your backends use " +
        (sameServiceAccount(metadata[0]) ? "service account " : "service accounts ") +
        serviceAccountDisplay(metadata[0]) +
        ". Granting access to one backend will grant access to all backends. Would you like to grant it now?",
    });
    if (grant) {
      return selectFromMetadata(metadata, [metadata[0].build, metadata[0].run]);
    }
    utils.logLabeledBullet("apphosting", GRANT_ACCESS_IN_FUTURE);
    return { build: [], run: [] };
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
    accum.add(row.build);
    accum.add(row.run);
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
  return selectFromMetadata(metadata, chosen);
}
