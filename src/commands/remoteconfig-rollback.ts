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

import { Command } from "../command";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { requireAuth } from "../requireAuth";
import { rollbackTemplate } from "../remoteconfig/rollback";
import { requirePermissions } from "../requirePermissions";
import { getVersions } from "../remoteconfig/versionslist";

import { needProjectId } from "../projectUtils";

export const command = new Command("remoteconfig:rollback")
  .description(
    "roll back a project's published Remote Config template to the one specified by the provided version number"
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get", "cloudconfig.configs.update"])
  .option(
    "-v, --version-number <versionNumber>",
    "rollback to the specified version of the template"
  )
  .withForce()
  .action(async (options) => {
    const templateVersion = await getVersions(needProjectId(options), 1);
    let targetVersion = 0;
    if (options.versionNumber) {
      targetVersion = options.versionNumber;
    } else {
      if (templateVersion?.versions[0]?.versionNumber) {
        const latestVersion = templateVersion.versions[0].versionNumber.toString();
        const previousVersion = parseInt(latestVersion) - 1;
        targetVersion = previousVersion;
      }
    }
    if (targetVersion <= 0) {
      throw new FirebaseError(
        `Failed to rollback Firebase Remote Config template for project to version` +
          targetVersion +
          `. ` +
          `Invalid Version Number`
      );
    }
    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        message: "Proceed to rollback template to version " + targetVersion + "?",
        default: false,
      },
      options
    );
    if (!confirm) {
      return;
    }
    return rollbackTemplate(needProjectId(options), targetVersion);
  });
