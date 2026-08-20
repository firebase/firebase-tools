import { bold } from "colorette";
import { FirebaseError, getError } from "./error";
import { getIamPolicy, setIamPolicy } from "./gcp/resourceManager";
import { configstore } from "./configstore";
import { mergeBindings, testIamPermissions } from "./gcp/iam";
import { logger } from "./logger";
import { sleep } from "./utils";

const PERMISSION_CACHE_KEY = "iamPermissionCache";
const IAM_PROPAGATION_DELAY_MS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type PermissionCache = Record<string, Record<string, Record<string, number>>>;

function checkPermissionCache(projectId: string, email: string, permissions: string[]): boolean {
  const cache = configstore.get(PERMISSION_CACHE_KEY) as PermissionCache | undefined;
  for (const perm of permissions) {
    const timestamp = cache?.[projectId]?.[email]?.[perm];
    if (!timestamp) {
      return false;
    }
    if (Date.now() - timestamp >= CACHE_TTL_MS) {
      return false;
    }
  }
  return true;
}

function cachePermissions(projectId: string, email: string, permissions: string[]): void {
  const cache = (configstore.get(PERMISSION_CACHE_KEY) || {}) as PermissionCache;
  if (!cache[projectId]) {
    cache[projectId] = {};
  }
  if (!cache[projectId][email]) {
    cache[projectId][email] = {};
  }
  for (const perm of permissions) {
    cache[projectId][email][perm] = Date.now();
  }
  configstore.set(PERMISSION_CACHE_KEY, cache);
}

function revokePermissions(projectId: string, email: string, permissions: string[]): void {
  const cache = configstore.get(PERMISSION_CACHE_KEY) as PermissionCache | undefined;
  if (!cache?.[projectId]?.[email]) {
    return;
  }
  let updated = false;
  for (const perm of permissions) {
    if (cache[projectId][email][perm] !== undefined) {
      delete cache[projectId][email][perm];
      updated = true;
    }
  }
  if (updated) {
    configstore.set(PERMISSION_CACHE_KEY, cache);
  }
}

/**
 * Assures that the authenticating account holds the specified IAM permissions on the given project.
 * If not, it attempts to bind the specified IAM role to the user.
 * Uses local configstore cache to avoid RM API query latency, unless force is true.
 */
export async function ensurePermissionsOrSetRole(
  projectId: string,
  accountEmail: string,
  permissions: string[],
  role: string,
  force = false,
  customLogger?: { debug: (message: string) => void },
): Promise<void> {
  const log = customLogger || logger;
  log.debug(
    `[iam] ensurePermissionsOrSetRole called for project: ${projectId}, account: ${accountEmail}, permissions: ${JSON.stringify(
      permissions,
    )}, role: ${role}, force: ${String(force)}`,
  );

  if (!force && checkPermissionCache(projectId, accountEmail, permissions)) {
    log.debug(
      `[iam] ensurePermissionsOrSetRole early out: permissions ${JSON.stringify(
        permissions,
      )} are cached for project ${projectId} and account ${accountEmail}`,
    );
    return;
  }

  log.debug(
    `[iam] Checking permissions ${JSON.stringify(permissions)} on project ${projectId} for ${accountEmail}`,
  );
  const iamResult = await testIamPermissions(projectId, permissions);
  if (iamResult.passed) {
    log.debug(
      `[iam] Account ${accountEmail} already has all required permissions: ${JSON.stringify(
        permissions,
      )}`,
    );
    log.debug(
      `[iam] Caching positive permissions check validation for project: ${projectId}, account: ${accountEmail}, permissions: ${JSON.stringify(
        permissions,
      )}`,
    );
    cachePermissions(projectId, accountEmail, permissions);
    return;
  }

  log.debug(
    `[iam] Account ${accountEmail} is missing permissions: ${JSON.stringify(
      iamResult.missing,
    )}. Attempting to bind role ${role}`,
  );
  revokePermissions(projectId, accountEmail, iamResult.missing);
  if (iamResult.allowed && iamResult.allowed.length > 0) {
    cachePermissions(projectId, accountEmail, iamResult.allowed);
  }

  const policy = await getIamPolicy(projectId);
  const memberName = accountEmail.endsWith(".gserviceaccount.com")
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
    } catch (err: unknown) {
      const error = getError(err);
      log.debug(`[iam] setIamPolicy failed: ${error.message}`);
      throw new FirebaseError(
        `Authorization failed. Account ${bold(accountEmail)} is missing the required IAM permissions on project ${bold(
          projectId,
        )}. Attempted to automatically bind the role ${bold(
          role,
        )} but failed (error: ${error.message}).\n\n` +
          `Please ask a project owner to grant you the role. They can do this either in the Google Cloud Console:\n` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}\n\n` +
          `Or by running the following command:\n` +
          `gcloud beta projects add-iam-policy-binding ${projectId} \\\n` +
          `  --member="${memberName}" \\\n` +
          `  --role="${role}"`,
        { original: error },
      );
    }
  }

  log.debug(
    `[iam] Caching positive permissions check validation for project: ${projectId}, account: ${accountEmail}, permissions: ${JSON.stringify(
      permissions,
    )}`,
  );
  cachePermissions(projectId, accountEmail, permissions);
}
