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
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import {
  deleteSecret,
  destroySecretVersion,
  getSecret,
  getSecretVersion,
  listSecretVersions,
} from "../gcp/secretManager";
import { promptOnce } from "../prompt";
import { logBullet, logWarning } from "../utils";
import * as secrets from "../functions/secrets";
import * as backend from "../deploy/functions/backend";
import * as args from "../deploy/functions/args";

export const command = new Command("functions:secrets:destroy <KEY>[@version]")
  .description("Destroy a secret. Defaults to destroying the latest version.")
  .withForce("Destroys a secret without confirmation.")
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);
    const haveBackend = await backend.existingBackend({ projectId } as args.Context);

    let [name, version] = key.split("@");
    if (!version) {
      version = "latest";
    }
    const sv = await getSecretVersion(projectId, name, version);

    if (sv.state === "DESTROYED") {
      logBullet(`Secret ${sv.secret.name}@${version} is already destroyed. Nothing to do.`);
      return;
    }

    const boundEndpoints = backend
      .allEndpoints(haveBackend)
      .filter((e) => secrets.inUse({ projectId, projectNumber }, sv.secret, e));
    if (boundEndpoints.length > 0) {
      const endpointsMsg = boundEndpoints
        .map((e) => `${e.id}[${e.platform}](${e.region})`)
        .join("\t\n");
      logWarning(
        `Secret ${name}@${version} is currently in use by following functions:\n\t${endpointsMsg}`
      );
      if (!options.force) {
        logWarning("Refusing to destroy secret in use. Use -f to destroy the secret anyway.");
        return;
      }
    }

    if (!options.force) {
      const confirm = await promptOnce(
        {
          name: "destroy",
          type: "confirm",
          default: true,
          message: `Are you sure you want to destroy ${sv.secret.name}@${sv.versionId}`,
        },
        options
      );
      if (!confirm) {
        return;
      }
    }
    await destroySecretVersion(projectId, name, version);
    logBullet(`Destroyed secret version ${name}@${sv.versionId}`);

    const secret = await getSecret(projectId, name);
    if (secrets.isFirebaseManaged(secret)) {
      const versions = await listSecretVersions(projectId, name);
      if (versions.filter((v) => v.state === "ENABLED").length === 0) {
        logBullet(`No active secret versions left. Destroying secret ${name}`);
        // No active secret version. Remove secret resource.
        await deleteSecret(projectId, name);
      }
    }
  });
