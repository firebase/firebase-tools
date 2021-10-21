import * as clc from "cli-color";

import * as secretUtils from "../../extensions/secretsUtils";
import * as secretManager from "../../gcp/secretManager";

import { Payload } from "./args";
import { getExtensionVersion, InstanceSpec } from "./planner";
import { promptCreateSecret } from "../../extensions/askUserForParam";
import { ExtensionSpec, Param, ParamType } from "../../extensions/extensionsApi";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { logLabeledBullet } from "../../utils";

interface SecretInfo {
  secret?: secretManager.Secret;
  secretVersion?: secretManager.SecretVersion;
  labels: Record<string, string>;
}

export async function handleSecretParams(
  payload: Payload,
  have: InstanceSpec[],
  nonInteractive: boolean
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

async function checkSpecForSecrets(i: InstanceSpec): Promise<boolean> {
  const extensionVersion = await getExtensionVersion(i);
  return secretUtils.usesSecrets(extensionVersion.spec);
}

const secretsInSpec = (spec: ExtensionSpec): Param[] => {
  return spec.params.filter((p) => p.type === ParamType.SECRET);
};

async function handleSecretsCreateInstance(i: InstanceSpec, nonInteractive: boolean) {
  const extensionVersion = await getExtensionVersion(i);
  const secretParams = secretsInSpec(extensionVersion.spec);
  for (const s of secretParams) {
    await handleSecretParamForCreate(s, i, nonInteractive);
  }
}

async function handleSecretsUpdateInstance(
  i: InstanceSpec,
  prevSpec: InstanceSpec,
  nonInteractive: boolean
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
  i: InstanceSpec,
  nonInteractive: boolean
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
      }, but expected a secret version.`
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
  } else if (!secretInfo.secretVersion) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
        `See more information about this secret at ${secretManager.secretManagerConsoleUri(
          projectId
        )}`
    );
  }
  if (
    !!secretInfo?.labels[secretUtils.SECRET_LABEL] &&
    secretInfo.labels[secretUtils.SECRET_LABEL] !== i.instanceId
  ) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} is managed by a different extension instance (${
          secretInfo.labels[secretUtils.SECRET_LABEL]
        }), so reusing it here can lead to unexpected behavior. ` +
        "Please choose a different name for this secret, and rerun this command."
    );
  }
}

async function handleSecretParamForUpdate(
  secretParam: Param,
  i: InstanceSpec,
  prevValue: string,
  nonInteractive: boolean
) {
  const providedValue = i.params[secretParam.param];
  if (!providedValue) {
    return;
  }
  const [, projectId, , secretName, , version] = providedValue.split("/");
  if (!projectId || !secretName || !version) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }, but expected a secret version.`
    );
  }
  // Don't allow changing secrets, only changing versions
  const [, prevProjectId, , prevSecretName] = prevValue.split("/");
  if (prevProjectId !== projectId || prevSecretName !== secretName) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }, ` +
        `but this instance was previously using a different secret projects/${prevProjectId}/secrets/${prevSecretName}.\n` +
        `Changing secrets is not supported. If you want to change the value of this secret, ` +
        `use a new version of projects/${prevProjectId}/secrets/${prevSecretName}.` +
        `You can create a new version at ${secretManager.secretManagerConsoleUri(projectId)}`
    );
  }
  const secretInfo = await getSecretInfo(projectId, secretName, version);
  if (!secretInfo.secret) {
    await promptForCreateSecret({
      projectId,
      secretName,
      instanceId: i.instanceId,
      secretParam,
      nonInteractive,
    });
  } else if (!secretInfo.secretVersion) {
    throw new FirebaseError(
      `${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${
        secretParam.param
      }. ` +
        `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
        `See more information about this secret at ${secretManager.secretManagerConsoleUri(
          projectId
        )}`
    );
  }
}

async function getSecretInfo(projectId: string, secretName: string, version: string) {
  const secretInfo: SecretInfo = {
    labels: {},
  };
  try {
    logger.debug(`Checking if projects/${projectId}/secrets/${secretName} exists`);
    secretInfo.secret = await secretManager.getSecret(projectId, secretName);
    logger.debug(
      `Found secret, checking if projects/${projectId}/secrets/${secretName}/versions/${version} exists`
    );
    secretInfo.secretVersion = await secretManager.getSecretVersion(projectId, secretName, version);
    logger.debug(`Found secretVersion, checking labels`);
    secretInfo.labels = await secretManager.getSecretLabels(projectId, secretName);
  } catch (err) {
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
    `${clc.bold(args.instanceId)}: Secret ${args.projectId}/${args.secretName} doesn't exist yet.`
  );
  if (args.nonInteractive) {
    throw new FirebaseError(
      `To create this secret, run this command in interactive mode, or go to ${secretManager.secretManagerConsoleUri(
        args.projectId
      )}`
    );
  }
  const ret = await promptCreateSecret(
    args.projectId,
    args.instanceId,
    args.secretParam,
    args.secretName
  );
  return ret;
}
