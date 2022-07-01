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

import { bold } from "cli-color";
import { getProjectId } from "./projectUtils";
import { requireAuth } from "./requireAuth";
import { logger } from "./logger";
import { FirebaseError } from "./error";
import { testIamPermissions } from "./gcp/iam";

// Permissions required for all commands.
const BASE_PERMISSIONS = ["firebase.projects.get"];

/**
 * Before filter that verifies authentication and performs informational IAM permissions check.
 *
 * @param options The command-wide options object.
 * @param permissions A list of IAM permissions to require.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requirePermissions(options: any, permissions: string[] = []): Promise<void> {
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  const requiredPermissions = BASE_PERMISSIONS.concat(permissions).sort();

  await requireAuth(options);

  logger.debug(
    `[iam] checking project ${projectId} for permissions ${JSON.stringify(requiredPermissions)}`
  );

  try {
    const iamResult = await testIamPermissions(projectId, requiredPermissions);
    if (!iamResult.passed) {
      throw new FirebaseError(
        `Authorization failed. This account is missing the following required permissions on project ${bold(
          projectId
        )}:\n\n  ${iamResult.missing.join("\n  ")}`
      );
    }
  } catch (err: any) {
    logger.debug(`[iam] error while checking permissions, command may fail: ${err}`);
    return;
  }
}
