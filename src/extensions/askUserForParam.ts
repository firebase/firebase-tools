import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";

import { Param, ParamOption, ParamType } from "./extensionsApi";
import * as secretManagerApi from "../gcp/secretManager";
import * as secretsUtils from "./secretsUtils";
import { logPrefix, substituteParams } from "./extensionsHelper";
import { convertExtensionOptionToLabeledList, getRandomString, onceWithJoin } from "./utils";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import * as utils from "../utils";
import { instance } from "firebase-functions/v1/database";

enum SecretUpdateAction {
  LEAVE,
  SET_NEW,
}

export function checkResponse(response: string, spec: Param): boolean {
  let valid = true;
  let responses: string[];

  if (spec.required && (response == "" || response == undefined)) {
    utils.logWarning(`Param ${spec.param} is required, but no value was provided.`);
    return false;
  }
  if (spec.type === ParamType.MULTISELECT) {
    responses = response.split(",");
  } else {
    // For Params of type SELECT and STRING, we test against the entire response.
    responses = [response];
  }

  if (spec.validationRegex && !!response) {
    // !!response to ignore empty optional params
    const re = new RegExp(spec.validationRegex);
    _.forEach(responses, (resp) => {
      if ((spec.required || resp !== "") && !re.test(resp)) {
        const genericWarn =
          `${resp} is not a valid value for ${spec.param} since it` +
          ` does not meet the requirements of the regex validation: "${spec.validationRegex}"`;
        utils.logWarning(spec.validationErrorMessage || genericWarn);
        valid = false;
      }
    });
  }

  if (spec.type && (spec.type === ParamType.MULTISELECT || spec.type === ParamType.SELECT)) {
    _.forEach(responses, (r) => {
      // A choice is valid if it matches one of the option values.
      const validChoice = _.some(spec.options, (option: ParamOption) => {
        return r === option.value;
      });
      if (!validChoice) {
        utils.logWarning(`${r} is not a valid option for ${spec.param}.`);
        valid = false;
      }
    });
  }
  return valid;
}

export async function askForParam(
  projectId: string,
  instanceId: string,
  paramSpec: Param,
  reconfiguring: boolean
): Promise<string> {
  let valid = false;
  let response = "";
  const description = paramSpec.description || "";
  const label = paramSpec.label.trim();
  logger.info(
    `\n${clc.bold(label)}${clc.bold(paramSpec.required ? "" : " (Optional)")}: ${marked(
      description
    ).trim()}`
  );

  while (!valid) {
    switch (paramSpec.type) {
      case ParamType.SELECT:
        response = await promptOnce({
          name: "input",
          type: "list",
          default: () => {
            if (paramSpec.default) {
              return getInquirerDefault(_.get(paramSpec, "options", []), paramSpec.default);
            }
          },
          message:
            "Which option do you want enabled for this parameter? " +
            "Select an option with the arrow keys, and use Enter to confirm your choice. " +
            "You may only select one option.",
          choices: convertExtensionOptionToLabeledList(paramSpec.options as ParamOption[]),
        });
        break;
      case ParamType.MULTISELECT:
        response = await onceWithJoin({
          name: "input",
          type: "checkbox",
          default: () => {
            if (paramSpec.default) {
              const defaults = paramSpec.default.split(",");
              return defaults.map((def) => {
                return getInquirerDefault(_.get(paramSpec, "options", []), def);
              });
            }
          },
          message:
            "Which options do you want enabled for this parameter? " +
            "Press Space to select, then Enter to confirm your choices. " +
            "You may select multiple options.",
          choices: convertExtensionOptionToLabeledList(paramSpec.options as ParamOption[]),
        });
        break;
      case ParamType.SECRET:
        response = reconfiguring
          ? await promptReconfigureSecret(projectId, instanceId, paramSpec)
          : await promptCreateSecret(projectId, instanceId, paramSpec);
        break;
      default:
        // Default to ParamType.STRING
        response = await promptOnce({
          name: paramSpec.param,
          type: "input",
          default: paramSpec.default,
          message: `Enter a value for ${label}:`,
        });
    }

    valid = checkResponse(response, paramSpec);
  }
  return response;
}

async function promptReconfigureSecret(
  projectId: string,
  instanceId: string,
  paramSpec: Param
): Promise<string> {
  const action = await promptOnce({
    type: "list",
    message: `Choose what you would like to do with this secret:`,
    choices: [
      { name: "Leave unchanged", value: SecretUpdateAction.LEAVE },
      { name: "Set new value", value: SecretUpdateAction.SET_NEW },
    ],
  });
  switch (action) {
    case SecretUpdateAction.SET_NEW:
      let secret;
      let secretName;
      if (paramSpec.default) {
        secret = secretManagerApi.parseSecretResourceName(paramSpec.default);
        secretName = secret.name;
      } else {
        secretName = await generateSecretName(projectId, instanceId, paramSpec.param);
      }

      const secretValue = await promptOnce({
        name: paramSpec.param,
        type: "password",
        message: `This secret will be stored in Cloud Secret Manager as ${secretName}.\nEnter new value for ${paramSpec.label.trim()}:`,
      });
      if (!secret) {
        secret = await secretManagerApi.createSecret(
          projectId,
          secretName,
          secretsUtils.getSecretLabels(instanceId)
        );
      }
      return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
    case SecretUpdateAction.LEAVE:
    default:
      return paramSpec.default || "";
  }
}

export async function promptCreateSecret(
  projectId: string,
  instanceId: string,
  paramSpec: Param,
  secretName?: string
): Promise<string> {
  const name = secretName ?? (await generateSecretName(projectId, instanceId, paramSpec.param));
  const secretValue = await promptOnce({
    name: paramSpec.param,
    type: "password",
    default: paramSpec.default,
    message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${name} and managed by Firebase Extensions (Firebase Extensions Service Agent will be granted Secret Admin role on this secret).\nEnter a value for ${paramSpec.label.trim()}:`,
  });
  if (secretValue === "" && paramSpec.required) {
    logger.info(`Secret value cannot be empty for required param ${paramSpec.param}`);
    return await promptCreateSecret(projectId, instanceId, paramSpec, name);
  } else if (secretValue !== "") {
    const secret = await secretManagerApi.createSecret(
      projectId,
      name,
      secretsUtils.getSecretLabels(instanceId)
    );
    return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
  }
  return secretValue;
}

async function generateSecretName(
  projectId: string,
  instanceId: string,
  paramName: string
): Promise<string> {
  let secretName = `ext-${instanceId}-${paramName}`;
  while (await secretManagerApi.secretExists(projectId, secretName)) {
    secretName += `-${getRandomString(3)}`;
  }
  return secretName;
}

async function addNewSecretVersion(
  projectId: string,
  instanceId: string,
  secret: secretManagerApi.Secret,
  paramSpec: Param,
  secretValue: string
) {
  const version = await secretManagerApi.addVersion(secret, secretValue);
  await secretsUtils.grantFirexServiceAgentSecretAdminRole(secret);
  return `projects/${version.secret.projectId}/secrets/${version.secret.name}/versions/${version.versionId}`;
}

export function getInquirerDefault(options: ParamOption[], def: string): string {
  const defaultOption = _.find(options, (option) => {
    return option.value === def;
  });
  return defaultOption ? defaultOption.label || defaultOption.value : "";
}

/**
 * Prompt users for params based on paramSpecs defined by the extension developer.
 * @param paramSpecs Array of params to ask the user about, parsed from extension.yaml.
 * @param firebaseProjectParams Autopopulated Firebase project-specific params
 * @return Promisified map of env vars to values.
 */
export async function ask(
  projectId: string,
  instanceId: string,
  paramSpecs: Param[],
  firebaseProjectParams: { [key: string]: string },
  reconfiguring: boolean
): Promise<{ [key: string]: string }> {
  if (_.isEmpty(paramSpecs)) {
    logger.debug("No params were specified for this extension.");
    return {};
  }

  utils.logLabeledBullet(logPrefix, "answer the questions below to configure your extension:");
  const substituted = substituteParams<Param[]>(paramSpecs, firebaseProjectParams);
  const result: any = {};
  const promises = _.map(substituted, (paramSpec: Param) => {
    return async () => {
      result[paramSpec.param] = await askForParam(projectId, instanceId, paramSpec, reconfiguring);
    };
  });
  // chaining together the promises so they get executed one after another
  await promises.reduce((prev, cur) => prev.then(cur as any), Promise.resolve());
  logger.info();
  return result;
}
