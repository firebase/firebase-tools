import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { confirm, checkbox, input } from "../prompt";
import { requireAuth } from "../requireAuth";
import { logBullet, logSuccess, logError } from "../utils";
import { formatServiceAccount } from "../gcp/proto";
import * as permissions from "../functions/permissions";
import {
  getDefaultAppEngineServiceAccount,
  getDefaultComputeEngineServiceAccount,
} from "../gcp/iam";

const RUN_BUILDER_ROLE = "roles/run.builder";
const SDK_SERVICE_AGENT_ROLE = "roles/firebase.sdkAdminServiceAgent";

/**
 * Command to grant IAM permissions to service accounts required for Cloud Functions
 */
export const command = new Command("functions:permissions:grant")
  .description("grant IAM permissions to service accounts required for Cloud Functions")
  .option(
    "--service-account <serviceAccount>",
    "specify a service account email to grant permissions to",
  )
  .option("--role <role>", "specify a role to grant")
  .withForce("automatically grant permissions without prompting")
  .before(requireAuth)
  .action(async (options: any) => {
    const projectId = needProjectId(options);

    await permissions.ensurePermissionToGrantRoles(projectId);

    let serviceAccounts: string[] = [];
    if (options.serviceAccount) {
      serviceAccounts = [
        formatServiceAccount(options.serviceAccount, projectId, true /* removeTypePrefix */),
      ];
    } else if (options.force) {
      // When --force is used, --service-account must be specified if not prompting.
      throw new FirebaseError("The --service-account flag must be provided when using --force.");
    } else {
      const projectNumber = await needProjectNumber(options);
      serviceAccounts = await promptForServiceAccounts(options, { projectId, projectNumber });
    }

    let rolesToGrant: string[] = [];
    if (options.role) {
      rolesToGrant = [permissions.normalizeRole(options.role as string)];
    } else if (options.force) {
      // When --force is used and --role is not specified, use default roles.
      logBullet(
        `Using default roles for grant: ${clc.bold(RUN_BUILDER_ROLE)} and ${clc.bold(SDK_SERVICE_AGENT_ROLE)}`,
      );
      rolesToGrant = [RUN_BUILDER_ROLE, SDK_SERVICE_AGENT_ROLE];
    } else {
      logBullet("Selecting roles to grant...");
      rolesToGrant = await promptForRoles(options);
    }

    const confirmMessage =
      "You are about to grant the following permissions:\n" +
      rolesToGrant.map((role) => `  - ${clc.bold(role)}\n`).join("") +
      "to these service accounts:\n" +
      serviceAccounts.map((sa) => `  - ${clc.bold(sa)}\n`).join("") +
      "\nContinue?";

    const cont = await confirm({
      message: confirmMessage,
      default: true,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });

    if (!cont) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    const results = [];
    for (const serviceAccount of serviceAccounts) {
      try {
        await permissions.grantRolesToServiceAccount(projectId, serviceAccount, rolesToGrant);
        results.push({
          serviceAccount,
          roles: rolesToGrant,
          success: true,
        });
      } catch (err) {
        results.push({
          serviceAccount,
          roles: rolesToGrant,
          success: false,
          error: err,
        });
      }
    }

    for (const result of results) {
      if (result.success) {
        logSuccess(
          `Successfully added roles ${clc.bold(result.roles.join(", "))} to ${clc.bold(result.serviceAccount)}`,
        );
      }
    }

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      for (const result of failures) {
        logError(
          `Failed to add roles ${clc.bold(result.roles.join(", "))} to ${clc.bold(result.serviceAccount)}`,
        );
      }
      throw new FirebaseError(
        "Some permission grants failed. Please have an IAM administrator retry the command.",
        { children: failures.map((f) => f.error) },
      );
    }
  });

/**
 * Prompts the user to select service accounts associated with Firebase Functions.
 */
export async function promptForServiceAccounts(
  options: any,
  {
    projectId,
    projectNumber,
  }: {
    projectId: string;
    projectNumber: string;
  },
): Promise<string[]> {
  const v1SA = getDefaultAppEngineServiceAccount(projectId);
  const v2SA = getDefaultComputeEngineServiceAccount(projectNumber);
  const choices = [
    {
      name: `${v2SA} (V2 default)`,
      value: v2SA,
      checked: true,
    },
    {
      name: `${v1SA} (V1 default)`,
      value: v1SA,
      checked: false,
    },
    {
      name: "Other",
      value: "other",
      checked: false,
    },
  ];

  const selected = await checkbox<string>({
    choices,
    message: "Which of the following service accounts do you want to grant permissions to?",
    validate: (list) => {
      return list.length > 0 ? true : "Please select at least one service account";
    },
  });

  if (selected.includes("other")) {
    const otherAccountEmail = await input({
      message: "Enter the email of the service account:",
      validate: (email: string) => {
        return email.includes("@") ? true : "Please enter a valid service account email";
      },
    });
    const idx = selected.indexOf("other");
    selected.splice(idx, 1, otherAccountEmail);
  }

  return selected;
}

/**
 * Prompts the user to select roles to grant
 * @returns Promise resolving to selected roles
 */
export async function promptForRoles(options: any): Promise<string[]> {
  const choices = [
    {
      name: `Default builder permissions (${RUN_BUILDER_ROLE})`,
      value: RUN_BUILDER_ROLE,
      checked: true,
    },
    {
      name: `Admin SDK permissions (${SDK_SERVICE_AGENT_ROLE})`,
      value: SDK_SERVICE_AGENT_ROLE,
      checked: true,
    },
    {
      name: "Other",
      value: "other",
      checked: false,
    },
  ];

  const selected = await checkbox<string>({
    choices,
    message: "Which of the following permissions do you wish to grant?",
    validate: (list) => {
      return list.length > 0 ? true : "Please select at least one role";
    },
  });

  if (selected.includes("other")) {
    const otherRole = await input({
      message: "Enter the role (e.g., roles/iam.serviceAccountUser or iam.serviceAccountUser):",
      validate: (role) => {
        return role.startsWith("roles/") || role.includes(".")
          ? true
          : "Please enter a valid role in the format 'roles/product.role' or 'product.role'";
      },
    });
    const idx = selected.indexOf("other");
    selected.splice(idx, 1, permissions.normalizeRole(otherRole));
  }

  return selected;
}
