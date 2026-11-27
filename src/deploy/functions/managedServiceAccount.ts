import * as backend from "./backend";
import * as iam from "../../gcp/iam";
import { getErrStatus } from "../../error";
import { logger } from "../../logger";

/** Label on functions that records the roles etag of their codebase's managed service account. */
export const DECLARATIVE_SECURITY_ETAG_LABEL = "firebase-declarative-security-etag";

/** Prefix of the service accounts the CLI creates for declarative security. */
export const MANAGED_SERVICE_ACCOUNT_PREFIX = "firebase-fn-";

/** The description the CLI gives the managed service account it creates for a codebase. */
export function managedServiceAccountDescription(codebase: string): string {
  return `Managed by Firebase CLI for codebase ${codebase}`;
}

/**
 * Who owns a managed service account used by a codebase's deployed functions:
 * - "codebase": its description names this codebase.
 * - "unknown": the account couldn't be read, so callers fall back to other signals.
 */
export interface ManagedServiceAccount {
  email: string;
  owner: "codebase" | "unknown";
}

/**
 * Finds the managed service account that a codebase's deployed functions use.
 *
 * A function can use any `firebase-fn-*` account, including one that another codebase
 * manages, so the account's description decides ownership. Accounts that name another
 * codebase, or no longer exist, are ignored. If an account can't be read, it is returned
 * with an "unknown" owner.
 */
export async function findManagedServiceAccount(
  projectId: string,
  codebase: string,
  have: backend.Backend,
): Promise<ManagedServiceAccount | undefined> {
  const candidates = new Set<string>();
  for (const endpoint of backend.allEndpoints(have)) {
    if (
      typeof endpoint.serviceAccount === "string" &&
      endpoint.serviceAccount.startsWith(MANAGED_SERVICE_ACCOUNT_PREFIX)
    ) {
      candidates.add(endpoint.serviceAccount);
    }
  }

  let unknown: string | undefined;
  for (const email of candidates) {
    let account: iam.ServiceAccount;
    try {
      account = await iam.getServiceAccount(projectId, email);
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        logger.debug(`Managed service account ${email} no longer exists.`);
        continue;
      }
      logger.debug(`Could not read service account ${email} to check its owner.`, err);
      unknown = unknown ?? email;
      continue;
    }
    if (account.description === managedServiceAccountDescription(codebase)) {
      return { email, owner: "codebase" };
    }
    logger.debug(
      `Service account ${email} is not managed by codebase ${codebase} ` +
        `(description: ${JSON.stringify(account.description ?? "")}).`,
    );
  }
  return unknown ? { email: unknown, owner: "unknown" } : undefined;
}
