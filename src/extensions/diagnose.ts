/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { logPrefix } from "./extensionsHelper";
import { getProjectNumber } from "../getProjectNumber";
import * as utils from "../utils";
import * as resourceManager from "../gcp/resourceManager";
import { listInstances } from "./extensionsApi";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const SERVICE_AGENT_ROLE = "roles/firebasemods.serviceAgent";

/**
 * Diagnoses and optionally fixes known issues with project configuration, ex. missing Extensions Service Agent permissions.
 * @param projectId ID of the project we're querying
 */
export async function diagnose(projectId: string): Promise<boolean> {
  const projectNumber = await getProjectNumber({ projectId });
  const firexSaProjectId = utils.envOverride(
    "FIREBASE_EXTENSIONS_SA_PROJECT_ID",
    "gcp-sa-firebasemods"
  );

  const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;

  utils.logLabeledBullet(logPrefix, "Checking project IAM policy...");

  // Call ListExtensionInstances to make sure Extensions Service Agent is provisioned.
  await listInstances(projectId);

  let policy;
  try {
    policy = await resourceManager.getIamPolicy(projectId);
    logger.debug(policy);
  } catch (e) {
    if (e instanceof FirebaseError && e.status === 403) {
      throw new FirebaseError(
        "Unable to get project IAM policy, permission denied (403). Please " +
          "make sure you have sufficient project privileges or if this is a brand new project " +
          "try again in a few minutes."
      );
    }
    throw e;
  }

  if (
    policy.bindings.find(
      (b) => b.role === SERVICE_AGENT_ROLE && b.members.includes("serviceAccount:" + saEmail)
    )
  ) {
    utils.logLabeledSuccess(logPrefix, "Project IAM policy OK");
    return true;
  } else {
    utils.logWarning(
      "Firebase Extensions Service Agent is missing a required IAM role " +
        "`Firebase Extensions API Service Agent`."
    );
    const fix = await promptOnce({
      type: "confirm",
      message:
        "Would you like to fix the issue by updating IAM policy to include Firebase " +
        "Extensions Service Agent with role `Firebase Extensions API Service Agent`",
    });
    if (fix) {
      policy.bindings.push({
        role: SERVICE_AGENT_ROLE,
        members: ["serviceAccount:" + saEmail],
      });
      await resourceManager.setIamPolicy(projectId, policy, "bindings");
      utils.logSuccess("Project IAM policy updated successfully");
      return true;
    }
    return false;
  }
}
