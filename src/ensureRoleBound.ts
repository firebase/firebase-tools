import { bold } from "colorette";
import { FirebaseError } from "./error";
import { getIamPolicy, setIamPolicy } from "./gcp/resourceManager";
import { configstore } from "./configstore";
import { mergeBindings } from "./gcp/iam";
import { logger } from "./logger";
import { sleep } from "./utils";

const ROLE_CACHE_KEY = "iamRoleCache";
const IAM_PROPAGATION_DELAY_MS = 10000;

function checkRoleCache(projectId: string, email: string, role: string): boolean {
  const cache = configstore.get(ROLE_CACHE_KEY) as Record<
    string,
    Record<string, Record<string, boolean>>
  >;
  return !!cache?.[projectId]?.[email]?.[role];
}

function cacheRole(projectId: string, email: string, role: string): void {
  const cache = (configstore.get(ROLE_CACHE_KEY) || {}) as Record<
    string,
    Record<string, Record<string, boolean>>
  >;
  if (!cache[projectId]) {
    cache[projectId] = {};
  }
  if (!cache[projectId][email]) {
    cache[projectId][email] = {};
  }
  cache[projectId][email][role] = true;
  configstore.set(ROLE_CACHE_KEY, cache);
}

/**
 * Assures that the authenticating account holds the specified IAM role on the given project.
 * Uses local configstore cache to avoid RM API query latency, unless force is true.
 */
export async function ensureRole(
  projectId: string,
  accountEmail: string,
  role: string,
  force = false,
  customLogger?: { debug: (message: string) => void },
): Promise<void> {
  const log = customLogger || logger;
  log.debug(
    `[iam] ensureRole called for project: ${projectId}, account: ${accountEmail}, role: ${role}, force: ${force}`,
  );
  if (!force && checkRoleCache(projectId, accountEmail, role)) {
    log.debug(
      `[iam] ensureRole early out: role ${role} is cached for project ${projectId} and account ${accountEmail}`,
    );
    return;
  }

  const policy = await getIamPolicy(projectId);
  const memberName = accountEmail.includes("gserviceaccount.com")
    ? `serviceAccount:${accountEmail}`
    : `user:${accountEmail}`;

  const hasRole =
    policy.bindings?.some((binding) => {
      return binding.role === role && binding.members.includes(memberName);
    }) ?? false;

  if (!hasRole) {
    policy.bindings = policy.bindings || [];
    mergeBindings(policy, [
      {
        role,
        members: [memberName],
      },
    ]);
    try {
      log.debug(
        `[iam] Attempting to setIamPolicy to bind role ${role} for ${memberName} on project ${projectId}`,
      );
      await setIamPolicy(projectId, policy, "bindings");
      // It usually takes few seconds to few minutes to propagate. Wait ${IAM_PROPAGATION_DELAY_MS}ms here to be safe.
      log.debug(
        `[iam] Successfully updated IAM policy. Waiting ${IAM_PROPAGATION_DELAY_MS}ms for propagation...`,
      );
      await sleep(IAM_PROPAGATION_DELAY_MS);
    } catch (err: any) {
      log.debug(`[iam] setIamPolicy failed: ${err.message || err}`);
      throw new FirebaseError(
        `Authorization failed. Account ${bold(accountEmail)} is missing the required IAM role ${bold(
          role,
        )} on project ${bold(projectId)}. Attempted to automatically bind the role but failed (error: ${err.message || err}).\n\n` +
          `Please ask a project owner to grant you the role. They can do this either in the Google Cloud Console:\n` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}\n\n` +
          `Or by running the following command:\n` +
          `gcloud beta projects add-iam-policy-binding ${projectId} \\\n` +
          `  --member="${memberName}" \\\n` +
          `  --role="${role}"`,
      );
    }
  }

  log.debug(
    `[iam] Caching positive role check validation for project: ${projectId}, account: ${accountEmail}, role: ${role}`,
  );
  cacheRole(projectId, accountEmail, role);
}
