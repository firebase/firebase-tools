import * as clc from "colorette";
import * as tty from "tty";

import { logger } from "../logger";
import { FirebaseError } from "../error";
import { ensureValidKey, ensureSecret, validateJsonSecret } from "../functions/secrets";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { Options } from "../options";
import { confirm } from "../prompt";
import { logBullet, logSuccess, logWarning, readSecretValue } from "../utils";
import { needProjectId, needProjectNumber } from "../projectUtils";
import {
  addVersion,
  destroySecretVersion,
  toSecretVersionResourceName,
  isFunctionsManaged,
  ensureApi,
} from "../gcp/secretManager";
import { check } from "../ensureApiEnabled";
import { requireAuth } from "../requireAuth";
import * as secrets from "../functions/secrets";
import * as backend from "../deploy/functions/backend";
import * as args from "../deploy/functions/args";

export const command = new Command("functions:secrets:set <KEY>")
  .description("create or update a secret for use in Cloud Functions for Firebase")
  .withForce("automatically updates functions to use the new secret")
  .before(requireAuth)
  .before(ensureApi)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
  ])
  .option(
    "--data-file <dataFile>",
    'file path from which to read secret data. Set to "-" to read the secret data from stdin',
  )
  .option("--format <format>", "format of the secret value. 'string' (default) or 'json'")
  .action(async (unvalidatedKey: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);
    const key = await ensureValidKey(unvalidatedKey, options);
    const secret = await ensureSecret(projectId, key, options);

    // Determine format using priority order: explicit flag > file extension > default to string
    let format = options.format as string | undefined;
    const dataFile = options.dataFile as string | undefined;
    if (!format && dataFile && dataFile !== "-") {
      // Auto-detect from file extension
      if (dataFile.endsWith(".json")) {
        format = "json";
      }
    }

    // Only error if there's no input source (no file and no piped stdin)
    if (!dataFile && tty.isatty(0) && options.nonInteractive) {
      throw new FirebaseError(
        `Cannot prompt for secret value in non-interactive mode.\n` +
          `Use --data-file to provide the secret value from a file.`,
      );
    }

    const promptSuffix = format === "json" ? " (JSON format)" : "";
    const secretValue = await readSecretValue(`Enter a value for ${key}${promptSuffix}:`, dataFile);

    if (format === "json") {
      validateJsonSecret(key, secretValue);
    }
    const secretVersion = await addVersion(projectId, key, secretValue);
    logSuccess(`Created a new secret version ${toSecretVersionResourceName(secretVersion)}`);

    if (!isFunctionsManaged(secret)) {
      logBullet(
        "Please deploy your functions for the change to take effect by running:\n\t" +
          clc.bold("firebase deploy --only functions"),
      );
      return;
    }

    const functionsEnabled = await check(
      projectId,
      "cloudfunctions.googleapis.com",
      "functions",
      /* silent= */ true,
    );
    if (!functionsEnabled) {
      logger.debug("Customer set secrets before enabling functions. Exiting");
      return;
    }

    let haveBackend = await backend.existingBackend({ projectId } as args.Context);
    const endpointsToUpdate = backend
      .allEndpoints(haveBackend)
      .filter((e) => secrets.inUse({ projectId, projectNumber }, secret, e));

    if (endpointsToUpdate.length === 0) {
      return;
    }

    logBullet(
      `${endpointsToUpdate.length} functions are using stale version of secret ${secret.name}:\n\t` +
        endpointsToUpdate.map((e) => `${e.id}(${e.region})`).join("\n\t"),
    );

    const redeploy = options.nonInteractive
      ? false
      : await confirm({
          message: `Do you want to re-deploy the functions and destroy the stale version of secret ${secret.name}?`,
          default: true,
          force: options.force,
        });
    if (!redeploy) {
      logBullet(
        "Please deploy your functions for the change to take effect by running:\n\t" +
          clc.bold("firebase deploy --only functions"),
      );
      return;
    }

    const updateOps = endpointsToUpdate.map(async (e) => {
      logBullet(`Updating function ${e.id}(${e.region})...`);
      const updated = await secrets.updateEndpointSecret(
        { projectId, projectNumber },
        secretVersion,
        e,
      );
      logBullet(`Updated function ${e.id}(${e.region}).`);
      return updated;
    });
    await Promise.all(updateOps);

    // Double check that old secrets versions are unused.
    haveBackend = await backend.existingBackend({ projectId } as args.Context, true);
    const staleEndpoints = backend.allEndpoints(
      backend.matchingBackend(haveBackend, (e) => {
        const pInfo = { projectId, projectNumber };
        return secrets.inUse(pInfo, secret, e) && !secrets.versionInUse(pInfo, secretVersion, e);
      }),
    );
    if (staleEndpoints.length !== 0) {
      logWarning(
        `${staleEndpoints.length} functions are unexpectedly using old version of secret ${secret.name} still:\n\t` +
          staleEndpoints.map((e) => `${e.id}(${e.region})`).join("\n\t"),
      );
      logBullet(
        "Please deploy your functions manually for the change to take effect by running:\n\t" +
          clc.bold("firebase deploy --only functions"),
      );
    }

    // Remove stale secret versions;
    const secretsToPrune = (
      await secrets.pruneSecrets({ projectId, projectNumber }, backend.allEndpoints(haveBackend))
    ).filter((sv) => sv.key === key);
    logBullet(
      `Removing secret versions: ${secretsToPrune
        .map((sv) => sv.key + "[" + sv.version + "]")
        .join(", ")}`,
    );
    await Promise.all(
      secretsToPrune.map((sv) => destroySecretVersion(projectId, sv.secret, sv.version)),
    );
  });
