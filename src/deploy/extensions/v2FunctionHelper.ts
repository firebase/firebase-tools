import { getProjectNumber } from "../../getProjectNumber";
import * as resourceManager from "../../gcp/resourceManager";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { ensure } from "../../ensureApiEnabled";
import * as planner from "./planner";
import { needProjectId } from "../../projectUtils";

const SERVICE_AGENT_ROLE = "roles/eventarc.eventReceiver";

/**
 * Checks whether spec contains v2 function resource.
 */
export async function checkSpecForV2Functions(i: planner.InstanceSpec): Promise<boolean> {
  const extensionSpec = await planner.getExtensionSpec(i);
  return extensionSpec.resources.some((r) => r.type === "firebaseextensions.v1beta.v2function");
}

/**
 * Enables APIs and grants roles necessary for running v2 functions.
 */
export async function ensureNecessaryV2ApisAndRoles(options: any) {
  const projectId = needProjectId(options);
  await ensure(projectId, "compute.googleapis.com", "extensions", options.markdown);
  await ensureComputeP4SARole(projectId);
}

async function ensureComputeP4SARole(projectId: string): Promise<boolean> {
  const projectNumber = await getProjectNumber({ projectId });
  const saEmail = `${projectNumber}-compute@developer.gserviceaccount.com`;

  let policy;
  try {
    policy = await resourceManager.getIamPolicy(projectId);
  } catch (e) {
    if (e instanceof FirebaseError && e.status === 403) {
      throw new FirebaseError(
        "Unable to get project IAM policy, permission denied (403). Please " +
          "make sure you have sufficient project privileges or if this is a brand new project " +
          "try again in a few minutes.",
      );
    }
    throw e;
  }

  if (
    policy.bindings.find(
      (b) => b.role === SERVICE_AGENT_ROLE && b.members.includes("serviceAccount:" + saEmail),
    )
  ) {
    logger.debug("Compute Service API Agent IAM policy OK");
    return true;
  } else {
    logger.debug(
      "Firebase Extensions Service Agent is missing a required IAM role " +
        "`Firebase Extensions API Service Agent`.",
    );
    policy.bindings.push({
      role: SERVICE_AGENT_ROLE,
      members: ["serviceAccount:" + saEmail],
    });
    await resourceManager.setIamPolicy(projectId, policy, "bindings");
    logger.debug("Compute Service API Agent IAM policy updated successfully");
    return true;
  }
}
