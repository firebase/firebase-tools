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

import * as args from "../deploy/functions/args";
import * as backend from "../deploy/functions/backend";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { pruneSecrets } from "../functions/secrets";
import { requirePermissions } from "../requirePermissions";
import { isFirebaseManaged } from "../deploymentTool";
import { logBullet, logSuccess } from "../utils";
import { promptOnce } from "../prompt";
import { destroySecretVersion } from "../gcp/secretManager";

export const command = new Command("functions:secrets:prune")
  .withForce("Destroys unused secrets without prompt")
  .description("Destroys unused secrets")
  .before(requirePermissions, [
    "cloudfunctions.functions.list",
    "secretmanager.secrets.list",
    "secretmanager.versions.list",
    "secretmanager.versions.destroy",
  ])
  .action(async (options: Options) => {
    const projectNumber = await needProjectNumber(options);
    const projectId = needProjectId(options);

    logBullet("Loading secrets...");

    const haveBackend = await backend.existingBackend({ projectId } as args.Context);
    const haveEndpoints = backend
      .allEndpoints(haveBackend)
      .filter((e) => isFirebaseManaged(e.labels || []));

    const pruned = await pruneSecrets({ projectNumber, projectId }, haveEndpoints);

    if (pruned.length === 0) {
      logBullet("All secrets are in use. Nothing to prune today.");
      return;
    }

    // prompt to get them all deleted
    logBullet(
      `Found ${pruned.length} unused active secret versions:\n\t` +
        pruned.map((sv) => `${sv.secret}@${sv.version}`).join("\n\t")
    );

    if (!options.force) {
      const confirm = await promptOnce(
        {
          name: "destroy",
          type: "confirm",
          default: true,
          message: `Do you want to destroy unused secret versions?`,
        },
        options
      );
      if (!confirm) {
        logBullet(
          "Run the following commands to destroy each unused secret version:\n\t" +
            pruned
              .map((sv) => `firebase functions:secrets:destroy ${sv.secret}@${sv.version}`)
              .join("\n\t")
        );
        return;
      }
    }
    await Promise.all(pruned.map((sv) => destroySecretVersion(projectId, sv.secret, sv.version)));
    logSuccess("Destroyed all unused secrets!");
  });
