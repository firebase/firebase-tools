import { logPrefix } from "./extensionsHelper";
import { getProjectNumber } from "../getProjectNumber";
import * as utils from "../utils";
import * as resourceManager from "../gcp/resourceManager";

const SERVICE_AGENT_ROLE = "roles/firebasemods.serviceAgent";

/**
 * Diagnoses and optionally fixes known issues with project configuration, ex. missing Extensions Service Agent permissions.
 * @param projectId ID of the project we're querying
 * @param fix Whether identified issues should be automatically fixed.
 */
export async function diagnose(projectId: string, fix: boolean): Promise<boolean> {
  const projectNumber = await getProjectNumber({ projectId });
  const firexSaProjectId = utils.envOverride(
    "FIREBASE_EXTENSIONS_SA_PROJECT_ID",
    "gcp-sa-firebasemods"
  );

  const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;

  utils.logLabeledBullet(logPrefix, "Checking project IAM policy...");

  const policy = await resourceManager.getIamPolicy(projectId);
  let foundP4saInPolicy = false;
  for (const b of policy.bindings) {
    if (b.role === SERVICE_AGENT_ROLE && b.members.includes("serviceAccount:" + saEmail)) {
      foundP4saInPolicy = true;
    }
  }
  if (foundP4saInPolicy) {
    utils.logLabeledSuccess(logPrefix, "Project IAM policy OK.");
    return true;
  } else {
    utils.logWarning(
      "Firebase Extensions Service Agent is missing a required IAM role `Firebase Extensions API Service Agent`."
    );
    if (fix) {
      utils.logLabeledBullet(
        logPrefix,
        "Updating IAM Policy of a project `" +
          projectId +
          "` to include a service account `" +
          saEmail +
          "` in a role `Firebase Extensions API Service Agent`"
      );
      policy.bindings.push({
        role: SERVICE_AGENT_ROLE,
        members: ["serviceAccount:" + saEmail],
      });
      await resourceManager.setIamPolicy(projectId, policy, "bindings");
      utils.logSuccess("Project IAM policy updated successfully.");
      return true;
    } else {
      utils.logLabeledBullet(
        logPrefix,
        "Run `firebase ext:diagnose --project=" + projectId + " --fix`"
      );
      return false;
    }
  }
}
