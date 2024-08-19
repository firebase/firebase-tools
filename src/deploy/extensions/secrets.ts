import * as clc from "colorette";

import * as secretUtils from "../../extensions/secretsUtils";
import * as secretManager from "../../gcp/secretManager";

import { Payload } from "./args";
import {
  getExtensionVersion,
  DeploymentInstanceSpec,
  InstanceSpec,
  getExtensionSpec,
} from "./planner";
import { promptCreateSecret } from "../../extensions/askUserForParam";
import { ExtensionSpec, Param, ParamType } from "../../extensions/types";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { logLabeledBullet } from "../../utils";

/**
 * handleSecretParams checks each spec for secret params, and validates that the secrets in the configuration exist.
 * If they don't, it prompts the user to create them in interactive mode
 * or throws an informative error in non-interactive mode
 * @param payload The deploy payload
 * @param have The instances currently installed on the project.
 * @param nonInteractive whether the user can be prompted to create secrets that are missing.
 */
export async function handleSecretParams(
  payload: Payload,
  have: DeploymentInstanceSpec[],
  nonInteractive: boolean,
) {
  for (const i of payload.instancesToCreate ?? []) {
    if (await checkSpecForSecrets(i)) {
      logLabeledBullet("extensions", `Verifying secret params for ${clc.bold(i.instanceId)}`);
      await handleSecretsCreateInstance(i, nonInteractive);
    }
  }
  const updates = [...(payload.instancesToUpdate ?? []), ...(payload.instancesToConfigure ?? [])];
  for (const i of updates) {
    if (await checkSpecForSecrets(i)) {
      logLabeledBullet("extensions", `Verifying secret params for ${clc.bold(i.instanceId)}`);
      const previousSpec = have.find((h) => h.instanceId === i.instanceId)!;
      await handleSecretsUpdateInstance(i, previousSpec, nonInteractive);
    }
  }
}

export async function checkSpecForSecrets(i: InstanceSpec): Promise<boolean> {
  const extensionSpec = await getExtensionSpec(i);
  return secretUtils.usesSecrets(extensionSpec);
}

const secretsInSpec = (spec: ExtensionSpec): Param[] => {
  return spec.params.filter((p) => p.type === ParamType.SECRET);
};

async function handleSecretsCreateInstance(i: DeploymentInstanceSpec, nonInteractive: boolean) {
  const spec = await getExtensionSpec(i);
  const secretParams = secretsInSpec(spec);
  for (const s of secretParams) {
    await handleSecretParamForCreate(s, i, nonInteractive);
  }
}

async function handleSecretsUpdateInstance(
  i: DeploymentInstanceSpec,
  prevSpec: DeploymentInstanceSpec,
  nonInteractive: boolean,
) {
  const extensionVersion = await getExtensionVersion(i);
  const prevExtensionVersion = await getExtensionVersion(prevSpec);
  const secretParams = secretsInSpec(extensionVersion.spec);
  for (const s of secretParams) {
    // If this was previously a secret param & was set, treat this as an update
    const prevParam = prevExtensionVersion.spec.params.find((p) => p.param === s.param);
    if (prevParam?.type === ParamType.SECRET && prevSpec.params[prevParam?.param]) {
      await handleSecretParamForUpdate(s, i, prevSpec.params[prevParam?.param], nonInteractive);
    } else {
      // Otherwise, this is a new secret param
      await handleSecretParamForCreate(s, i, nonInteractive);
    }
  }
}

async function handleSecretParamForCreate(
  secretParam: Param,
  i: DeploymentInstanceSpec,
  nonInteractive: boolean,
): Promise<void> {
  const providedValue = i.params[secretParam.param];
  if (!providedValue) {
    return;
  }
  // First, check that param is well formed.
  const [, projectId, , secretName, , version] = providedValue.split("/");
  if (!projectId || !secretName || !version) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }, but expected a secret version.`,
    );
  }
  // Then, go get all the info about the current state of the secret.
  const secretInfo = await getSecretInfo(projectId, secretName, version);
  // If the secret doesn't exist, prompt the user for a value, create it, and label it.
  if (!secretInfo.secret) {
    await promptForCreateSecret({
      projectId,
      secretName,
      instanceId: i.instanceId,
      secretParam,
      nonInteractive,
    });
    return;
  } else if (!secretInfo.secretVersion) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
        `See more information about this secret at ${secretManager.secretManagerConsoleUri(
          projectId,
        )}`,
    );
  }
  // If the secret is managed, but by a different extension, error out.
  if (
    !!secretInfo?.secret?.labels &&
    !!secretInfo?.secret.labels[secretUtils.SECRET_LABEL] &&
    secretInfo.secret.labels[secretUtils.SECRET_LABEL] !== i.instanceId
  ) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} is managed by a different extension instance (${
          secretInfo.secret.labels[secretUtils.SECRET_LABEL]
        }), so reusing it here can lead to unexpected behavior. ` +
        "Please choose a different name for this secret, and rerun this command.",
    );
  }
  // If we get to this point, we're OK to just use what was included in the params.
  // Just need to make sure the Extensions P4SA has access.
  await secretUtils.grantFirexServiceAgentSecretAdminRole(secretInfo.secret);
}

async function handleSecretParamForUpdate(
  secretParam: Param,
  i: DeploymentInstanceSpec,
  prevValue: string,
  nonInteractive: boolean,
): Promise<void> {
  const providedValue = i.params[secretParam.param];
  if (!providedValue) {
    return;
  }
  const [, projectId, , secretName, , version] = providedValue.split("/");
  if (!projectId || !secretName || !version) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }, but expected a secret version.`,
    );
  }
  // Don't allow changing secrets, only changing versions
  const [, prevProjectId, , prevSecretName] = prevValue.split("/");
  if (prevSecretName !== secretName) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }, ` +
        `but this instance was previously using a different secret projects/${prevProjectId}/secrets/${prevSecretName}.\n` +
        `Changing secrets is not supported. If you want to change the value of this secret, ` +
        `use a new version of projects/${prevProjectId}/secrets/${prevSecretName}.` +
        `You can create a new version at ${secretManager.secretManagerConsoleUri(projectId)}`,
    );
  }
  const secretInfo = await getSecretInfo(projectId, secretName, version);
  if (!secretInfo.secret) {
    i.params[secretParam.param] = await promptForCreateSecret({
      projectId,
      secretName,
      instanceId: i.instanceId,
      secretParam,
      nonInteractive,
    });
    return;
  } else if (!secretInfo.secretVersion) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
        `See more information about this secret at ${secretManager.secretManagerConsoleUri(
          projectId,
        )}`,
    );
  }
  // Set the param value to the exact resource name we get from SecretManager,
  // so 'latest' gets resolved to a version number.
  i.params[secretParam.param] = secretManager.toSecretVersionResourceName(secretInfo.secretVersion);
  // If we get to this point, we're OK to just use what was included in the params.
  // Just need to make sure the Extensions P4SA has access.
  await secretUtils.grantFirexServiceAgentSecretAdminRole(secretInfo.secret);
}

async function getSecretInfo(
  projectId: string,
  secretName: string,
  version: string,
): Promise<{
  secret?: secretManager.Secret;
  secretVersion?: secretManager.SecretVersion;
}> {
  const secretInfo: any = {};
  try {
    secretInfo.secret = await secretManager.getSecret(projectId, secretName);
    secretInfo.secretVersion = await secretManager.getSecretVersion(projectId, secretName, version);
  } catch (err: any) {
    // Throw anything other than the expected 404 errors.
    if (err.status !== 404) {
      throw err;
    }
  }
  return secretInfo;
}

async function promptForCreateSecret(args: {
  projectId: string;
  secretName: string;
  instanceId: string;
  secretParam: Param;
  nonInteractive: boolean;
}): Promise<string> {
  logger.info(
    `${clc.bold(args.instanceId)}: Secret ${args.projectId}/${args.secretName} doesn't exist yet.`,
  );
  if (args.nonInteractive) {
    throw new FirebaseError(
      `To create this secret, run this command in interactive mode, or go to ${secretManager.secretManagerConsoleUri(
        args.projectId,
      )}`,
    );
  }
  return promptCreateSecret(args.projectId, args.instanceId, args.secretParam, args.secretName);
}
