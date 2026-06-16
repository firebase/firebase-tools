import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import * as iam from "../../../gcp/iam";
import * as resourcemanager from "../../../gcp/resourceManager";
import { confirm } from "../../../prompt";
import * as crypto from "crypto";

/**
 * Represents the required IAM service account and role modifications for a codebase.
 *
 * This struct exists independently of regional function plans because IAM service
 * accounts exist at the GCP Project level and are global across all GCP regions.
 * Any role grants or revocations are orchestrated exactly once for the entire codebase
 * across all regional changesets.
 */
export interface SecurityPlan {

  codebase: string;
  serviceAccount: string; // The email of the managed SA
  saAction: "create" | "delete" | "none";
  rolesToGrant: string[];
  rolesToRevoke: string[];
}

/**
 * Plans and prompts for declarative security changes for a single codebase.
 */
export async function createSecurityPlan(
  codebase: string,
  want: backend.Backend,
  have: backend.Backend,
  projectId: string,
): Promise<SecurityPlan | undefined> {
  const requiredRoles = want.requiredRoles;

  // The backend should be homogeneous, so we only need to read the first endpoint
  // to determine the existing managed service account and etag.
  const firstHave = backend.allEndpoints(have)[0];
  let existingManagedSA: string | undefined;
  let existingEtag: string | undefined;
  if (firstHave) {
    existingEtag = firstHave.labels?.["firebase-declarative-roles-etag"];
    existingManagedSA = firstHave.serviceAccount?.startsWith("firebase-fn-")
      ? firstHave.serviceAccount
      : undefined;
  }

  // Scenario A: Opt-out (was using, now not using)
  if (!requiredRoles && existingManagedSA && existingEtag) {
    const confirmed = await confirm({
      default: false,
      message: `Deploying this code will opt out of declarative security for codebase ${codebase}. All functions which do not specify a custom service account will use a default service account on next deploy. As a cleanup, the managed service account ${existingManagedSA} will be deleted. Continue?`,
    });
    if (!confirmed) {
      throw new FirebaseError("Deployment canceled by user.");
    }

    return {
      codebase,
      serviceAccount: existingManagedSA,
      saAction: "delete",
      rolesToGrant: [],
      rolesToRevoke: [],
    };
  }

  // If not using now and was not using, do nothing
  if (!requiredRoles) {
    return undefined;
  }

  // Validation: Combining explicit custom SA and declarative security anywhere in wantBackend
  if (
    backend.someEndpoint(
      want,
      (e) =>
        typeof e.serviceAccount === "string" &&
        e.serviceAccount !== "default" &&
        !e.serviceAccount.startsWith("firebase-fn-"),
    )
  ) {
    throw new FirebaseError(
      `Cannot use explicit custom service accounts on functions while using declarative security in codebase ${codebase}.`,
    );
  }

  // Determine Managed SA
  let managedSAEmail = existingManagedSA;
  let saAction: "create" | "delete" | "none" = "none";
  if (!managedSAEmail) {
    const saToCreate = await iam.generateManagedServiceAccountName(projectId);
    managedSAEmail = `${saToCreate}@${projectId}.iam.gserviceaccount.com`;
    saAction = "create";
  }

  // Compute Etag
  const existingSalt = existingEtag ? existingEtag.split("-")[0] : undefined;
  const newEtag = computeRolesEtag(requiredRoles, existingSalt);

  // Update all wantBackend endpoints to use this SA and etag
  for (const endpoint of backend.allEndpoints(want)) {
    endpoint.serviceAccount = managedSAEmail;
    endpoint.labels = endpoint.labels || {};
    endpoint.labels["firebase-declarative-roles-etag"] = newEtag;
  }

  // Skip if Etag matches existing
  if (existingEtag && existingEtag === newEtag) {
    return {
      codebase,
      serviceAccount: managedSAEmail,
      saAction: "none",
      rolesToGrant: [],
      rolesToRevoke: [],
    };
  }

  // Security changes needed. Verify user has operator permissions before doing role diffs.
  // Note: this may happen after deploys when trying to remove a role if no new roles were granted.
  // This is an appropriate place to use testIamPermissions before the deploy starts because
  // you cannot safely remove the role before changing prod functions without breaking live traffic.
  const permissionsToTest = ["resourcemanager.projects.setIamPolicy"];
  if (saAction === "create") {
    permissionsToTest.push("iam.serviceAccounts.create");
  }
  const iamResult = await iam.testIamPermissions(projectId, permissionsToTest);
  if (!iamResult.passed) {
    throw new FirebaseError(
      `Cannot enable/modify declarative security because you do not have permissions necessary (${iamResult.missing.join(
        ", ",
      )}). Please ask an IAM administrator to perform the next deploy.`,
    );
  }

  // Diff & Prompt
  let existingRoles: string[] = [];
  if (saAction === "none") {
    existingRoles = await resourcemanager.getServiceAccountRoles(projectId, managedSAEmail);
  }

  const addedRoles = requiredRoles.filter((r) => !existingRoles.includes(r));
  const removedRoles = existingRoles.filter((r) => !requiredRoles.includes(r));

  if (saAction === "create") {
    const roleNames = await Promise.all(requiredRoles.map((r) => iam.getRoleName(r)));
    const message = `This codebase uses declarative security. It will use the following role(s):\n${roleNames
      .map((r) => `* ${r}`)
      .join("\n")}\nContinue?`;
    const confirmed = await confirm({
      default: false,
      message,
    });
    if (!confirmed) {
      throw new FirebaseError("Deployment canceled by user.");
    }
  } else if (addedRoles.length > 0 || removedRoles.length > 0) {
    let message = `Deploying this code will modify the managed service account for codebase ${codebase}.\n`;
    if (addedRoles.length > 0) {
      const addedNames = await Promise.all(addedRoles.map((r) => iam.getRoleName(r)));
      message += `All functions in this codebase will be granted the following new role(s):\n${addedNames
        .map((r) => `* ${r}`)
        .join("\n")}\n`;
    }
    if (removedRoles.length > 0) {
      const removedNames = await Promise.all(removedRoles.map((r) => iam.getRoleName(r)));
      message += `All functions in this codebase will lose access to the following role(s):\n${removedNames
        .map((r) => `* ${r}`)
        .join("\n")}\n`;
    }
    message += "Continue?";
    const confirmed = await confirm({
      default: false,
      message,
    });
    if (!confirmed) {
      throw new FirebaseError("Deployment canceled by user.");
    }
  }

  return {
    codebase,
    serviceAccount: managedSAEmail,
    saAction,
    rolesToGrant: addedRoles,
    rolesToRevoke: removedRoles,
  };
}

/** Computes a base38 label etag formatted as <random 10 char salt>-<base38 hash>. */
export function computeRolesEtag(roles: string[], existingSalt?: string): string {
  const BASE38_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-_";
  let salt = existingSalt;
  if (!salt) {
    salt = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // a-z
    for (let i = 0; i < 9; i++) {
      salt += BASE38_CHARS[Math.floor(Math.random() * 38)];
    }
  }
  const sorted = Array.from(roles).sort();
  const hashBuffer = crypto
    .createHash("sha256")
    .update(salt + sorted.join(","))
    .digest();
  let hashStr = "";
  for (const byte of hashBuffer) {
    hashStr += BASE38_CHARS[byte % 38];
  }
  return `${salt}-${hashStr.substring(0, 52)}`;
}
