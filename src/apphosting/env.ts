import * as clc from "colorette";

import { FirebaseError } from "../error";
import * as secretManager from "../gcp/secretManager";
import * as prompt from "../prompt";
import * as config from "./config";
import { Document } from "yaml";
import * as secrets from "./secrets";
import * as utils from "../utils";

const dynamicDispatch = exports as {
  diffEnvs: typeof diffEnvs;
  confirmConflicts: typeof confirmConflicts;
  chooseNewSecrets: typeof chooseNewSecrets;
};

export interface DiffResults {
  newVars: string[];
  matched: string[];
  conflicts: string[];
}

export async function diffEnvs(
  projectId: string,
  envs: Record<string, string>,
  doc: Document,
): Promise<DiffResults> {
  const newVars: string[] = [];
  const matched: string[] = [];
  const conflicts: string[] = [];

  // Note: Can conceivably optimize this by parallelizing lookups of secret values with fetchSecrets.
  // Unlikely to actually cause noticeable benefits.
  for (const [key, value] of Object.entries(envs)) {
    const existingEnv = config.findEnv(doc, key);
    if (!existingEnv) {
      newVars.push(key);
      continue;
    }

    let match = false;
    if (existingEnv.value) {
      match = existingEnv.value === value;
    } else {
      try {
        match =
          value ===
          (await secretManager.accessSecretVersion(projectId, existingEnv.secret!, "latest"));
      } catch (err) {
        utils.logLabeledWarning(
          "apphosting",
          `Cannot read value of existing secret ${existingEnv.secret!} to see if it has changed. Assuming it has changed.`,
        );
      }
    }

    (match ? matched : conflicts).push(key);
  }
  return { newVars, matched, conflicts };
}

export async function confirmConflicts(conflicts: string[]): Promise<string[]> {
  if (!conflicts.length) {
    return conflicts;
  }

  const overwrite = await prompt.checkbox<string>({
    message:
      "The following variables have different values in apphosting.yaml. Which would you like to overwrite?",
    choices: conflicts,
  });
  return overwrite;
}

export async function chooseNewSecrets(vars: string[]): Promise<string[]> {
  if (!vars.length) {
    return vars;
  }

  return await prompt.checkbox<string>({
    message:
      "Sensitive data should be stored in Cloud Secrets Manager so that access to its value is protected. Which variables are sensitive?",
    choices: vars.map((name) => ({
      value: name,
      checked: name.includes("KEY") || name.includes("SECRET"),
    })),
  });
}

/**
 * Merges a .env file with a YAML document including uploading, but not necessarily granting permission, to secrets.
 * We're using a YAML doc and not worrying about file saving or granting permissions so that the caller can swap out whether
 * this is a local yaml (for which env) or whether this is for remote env.
 * @returns A list of secrets which were created and may need access granted.
 */
export async function importEnv(
  projectId: string,
  envs: Record<string, string>,
  doc: Document,
): Promise<string[]> {
  let { newVars, conflicts } = await dynamicDispatch.diffEnvs(projectId, envs, doc);

  conflicts = await dynamicDispatch.confirmConflicts(conflicts);
  const newSecrets = await dynamicDispatch.chooseNewSecrets(newVars);

  for (const key of conflicts) {
    const existingEnv = config.findEnv(doc, key);
    if (!existingEnv) {
      throw new FirebaseError(`Internal error: expected existing env for ${key}`, { exit: 1 });
    }
    if (existingEnv.value) {
      existingEnv.value = envs[key];
      config.upsertEnv(doc, existingEnv);
    } else {
      const secretValue = envs[key];
      const version = await secretManager.addVersion(projectId, existingEnv.secret!, secretValue);
      utils.logSuccess(
        `Created new secret version ${secretManager.toSecretVersionResourceName(version)}`,
      );
      // TODO: What do we do if the YAML is pinned to a specific version?
    }
  }

  const newPlaintext = newVars.filter((v) => !newSecrets.includes(v));
  for (const key of newPlaintext) {
    config.upsertEnv(doc, { variable: key, value: envs[key] });
  }

  // NOTE: not doing this in parallel to avoid interleaving log lines in a way that might be confusing.
  for (const key of newSecrets) {
    // TODO: (How) do we support secrets in a specific location? Not investing deeply right now since everything in App Hosting
    // is curreently global jurrisdiction and we may be chaging to REP managing secrets locality instead of UMMR anyway.
    const created = await secrets.upsertSecret(projectId, key);
    if (created) {
      utils.logSuccess(`Created new secret projects/${projectId}/secrets/${key}`);
    }

    const version = await secretManager.addVersion(projectId, key, envs[key]);
    utils.logSuccess(
      `Created new secret version ${secretManager.toSecretVersionResourceName(version)}`,
    );
    utils.logBullet(
      `You can access the contents of the secret's latest value with ${clc.bold(`firebase apphosting:secrets:access ${key}\n`)}`,
    );

    config.upsertEnv(doc, { variable: key, secret: key });
  }
  return newSecrets;
}
