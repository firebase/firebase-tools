import * as path from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { ExtensionSpec, Param } from "./types";
import { getFirebaseProjectParams, substituteParams } from "./extensionsHelper";
import * as askUserForParam from "./askUserForParam";
import { checkResponse } from "./askUserForParam";
import * as env from "../functions/env";

const NONINTERACTIVE_ERROR_MESSAGE =
  "As of firebase-tools@11, `ext:install`, `ext:update` and `ext:configure` are interactive only commands. " +
  "To deploy an extension noninteractively, use an extensions manifest and `firebase deploy --only extensions`.  " +
  "See https://firebase.google.com/docs/extensions/manifest for more details";

/**
 * Interface for holding different param values for different environments/configs.
 *
 * baseValue: The base value of the configurations, stored in {instance-id}.env.
 * local: The local value used by extensions emulators. Only used by secrets in {instance-id}.secret.env for now.
 */
export interface ParamBindingOptions {
  baseValue: string;
  local?: string;
  // Add project specific key:value here when we want to support that.
}

export function getBaseParamBindings(params: { [key: string]: ParamBindingOptions }): {
  [key: string]: string;
} {
  let ret = {};
  for (const [k, v] of Object.entries(params)) {
    ret = {
      ...ret,
      ...{ [k]: v.baseValue },
    };
  }
  return ret;
}

export function buildBindingOptionsWithBaseValue(baseParams: { [key: string]: string }): {
  [key: string]: ParamBindingOptions;
} {
  let paramOptions: { [key: string]: ParamBindingOptions } = {};
  for (const [k, v] of Object.entries(baseParams)) {
    paramOptions = {
      ...paramOptions,
      ...{ [k]: { baseValue: v } },
    };
  }
  return paramOptions;
}

/**
 * A mutator to switch the defaults for a list of params to new ones.
 * For convenience, this also returns the params
 *
 * @param params A list of params
 * @param newDefaults a map of { PARAM_NAME: default_value }
 */
export function setNewDefaults(params: Param[], newDefaults: { [key: string]: string }): Param[] {
  for (const param of params) {
    if (newDefaults[param.param]) {
      param.default = newDefaults[param.param];
    } else if (
      param.param === `firebaseextensions.v1beta.function/location` &&
      newDefaults["LOCATION"]
    ) {
      // Special case handling for when we are updating from LOCATION to system param location.
      param.default = newDefaults["LOCATION"];
    }
  }
  return params;
}

/**
 * Gets params from the user
 * or prompting the user for each param.
 * @param projectId the id of the project in use
 * @param paramSpecs a list of params, ie. extensionSpec.params
 * @param envFilePath a path to an env file containing param values
 * @throws FirebaseError if an invalid env file is passed in
 */
export async function getParams(args: {
  projectId?: string;
  instanceId: string;
  paramSpecs: Param[];
  nonInteractive?: boolean;
  reconfiguring?: boolean;
}): Promise<Record<string, ParamBindingOptions>> {
  let params: Record<string, ParamBindingOptions>;
  if (args.nonInteractive) {
    throw new FirebaseError(NONINTERACTIVE_ERROR_MESSAGE);
  } else {
    const firebaseProjectParams = await getFirebaseProjectParams(args.projectId);
    params = await askUserForParam.ask({
      projectId: args.projectId,
      instanceId: args.instanceId,
      paramSpecs: args.paramSpecs,
      firebaseProjectParams,
      reconfiguring: !!args.reconfiguring,
    });
  }
  return params;
}

export async function getParamsForUpdate(args: {
  spec: ExtensionSpec;
  newSpec: ExtensionSpec;
  currentParams: { [option: string]: string };
  projectId?: string;
  nonInteractive?: boolean;
  instanceId: string;
}): Promise<Record<string, ParamBindingOptions>> {
  let params: Record<string, ParamBindingOptions>;
  if (args.nonInteractive) {
    throw new FirebaseError(NONINTERACTIVE_ERROR_MESSAGE);
  } else {
    params = await promptForNewParams({
      spec: args.spec,
      newSpec: args.newSpec,
      currentParams: args.currentParams,
      projectId: args.projectId,
      instanceId: args.instanceId,
    });
  }
  return params;
}

/**
 * Displays params that exist in spec but not newSpec,
 * and then prompts user for any params in newSpec that are not in spec.
 *
 * @param spec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 * @param currentParams A set of current params and their values
 */
export async function promptForNewParams(args: {
  spec: ExtensionSpec;
  newSpec: ExtensionSpec;
  currentParams: { [option: string]: string };
  projectId?: string;
  instanceId: string;
}): Promise<{ [option: string]: ParamBindingOptions }> {
  const newParamBindingOptions = buildBindingOptionsWithBaseValue(args.currentParams);

  const allOldParams = (args.spec.params ?? []).concat(args.spec.systemParams ?? []);
  const allNewParams = (args.newSpec.params ?? []).concat(args.newSpec.systemParams ?? []);

  // Special case for updating from LOCATION to system param location
  if (
    allOldParams.some((p) => p.param === "LOCATION") &&
    allNewParams.some((p) => p.param === "firebaseextensions.v1beta.function/location") &&
    !!args.currentParams["LOCATION"]
  ) {
    newParamBindingOptions["firebaseextensions.v1beta.function/location"] = {
      baseValue: args.currentParams["LOCATION"],
    };
    delete newParamBindingOptions["LOCATION"];
  }

  // Pre-fill default values for any new optional parameters in newSpec that are not currently set
  for (const newP of allNewParams) {
    if (!newP.required && newParamBindingOptions[newP.param] === undefined) {
      newParamBindingOptions[newP.param] = {
        baseValue: newP.default ?? "",
      };
    }
  }

  // Check Rule 4 trigger conditions:
  // 1) Are there old parameters that are not assigned to new parameters?
  const unassignedOldParams = allOldParams.filter((oldP) => {
    if (
      oldP.param === "LOCATION" &&
      allNewParams.some((p) => p.param === "firebaseextensions.v1beta.function/location")
    ) {
      return false;
    }
    return !allNewParams.some((newP) => newP.param === oldP.param);
  });

  if (unassignedOldParams.length) {
    logger.info("The following params will no longer be used:");
    for (const param of unassignedOldParams) {
      if (args.currentParams[param.param] !== undefined) {
        logger.info(clc.red(`- ${param.param}: ${args.currentParams[param.param]}`));
      }
      delete newParamBindingOptions[param.param];
    }
  }

  // 2) Is a required system parameter (location) not set?
  const hasLocationSpec = allNewParams.some(
    (p) => p.param === "firebaseextensions.v1beta.function/location",
  );
  const locationIsSet =
    !!newParamBindingOptions["firebaseextensions.v1beta.function/location"]?.baseValue ||
    !!args.currentParams["firebaseextensions.v1beta.function/location"] ||
    !!args.currentParams["LOCATION"];
  const locationNotSet = hasLocationSpec && !locationIsSet;

  const triggerAdvancedSystemParams = unassignedOldParams.length > 0 || locationNotSet;

  // Collect parameters to prompt based on specified rules
  const paramsToPrompt: Param[] = [];

  for (const newP of allNewParams) {
    const oldP = allOldParams.find((p) => p.param === newP.param);
    const currentVal = newParamBindingOptions[newP.param]?.baseValue;

    const isSystem =
      isSystemParam(newP.param) ||
      (args.newSpec.systemParams ?? []).some((p) => p.param === newP.param);

    // Rule 1: New (non-system) parameters in newSpec that were not in oldSpec
    if (!oldP && !isSystem) {
      paramsToPrompt.push(newP);
      continue;
    }

    // Rule 2: Changed type
    if (oldP && oldP.type !== newP.type) {
      paramsToPrompt.push(newP);
      continue;
    }

    // Rule 3: Changed validators and the current new rejects the old value
    if (currentVal !== undefined && currentVal !== "" && !checkResponse(currentVal, newP)) {
      paramsToPrompt.push(newP);
      continue;
    }

    // Rule 4: Are newly required and not currently set
    if (newP.required && (currentVal === undefined || currentVal === "")) {
      paramsToPrompt.push(newP);
      continue;
    }

    // Rule 5: System and advanced parameters IF trigger condition met.
    // If the old extension spec has parameters that were dropped in the new spec (unassignedOldParams),
    // they may have been custom/legacy parameter names for features (such as $TIMEOUT or $LOCATION)
    // created before official system parameters existed. Prompting for system and advanced parameters
    // ensures those settings are transferred to system parameters rather than being silently dropped.
    if (triggerAdvancedSystemParams && (isSystem || newP.advanced)) {
      paramsToPrompt.push(newP);
      continue;
    }
  }

  // De-duplicate paramsToPrompt by param name
  let uniqueParamsToPrompt = paramsToPrompt.filter(
    (p, index, self) => index === self.findIndex((tp) => tp.param === p.param),
  );

  if (uniqueParamsToPrompt.length) {
    const firebaseProjectParams = await getFirebaseProjectParams(args.projectId);
    uniqueParamsToPrompt = substituteParams<Param[]>(uniqueParamsToPrompt, firebaseProjectParams);
    logger.info("To update this instance, configure the following parameters:");
    for (const param of uniqueParamsToPrompt) {
      const chosenValue = await askUserForParam.askForParam({
        projectId: args.projectId,
        instanceId: args.instanceId,
        paramSpec: param,
        reconfiguring: false,
      });
      newParamBindingOptions[param.param] = chosenValue;
    }
  }

  return newParamBindingOptions;
}

export function readEnvFile(envPath: string): Record<string, string> {
  const buf = fs.readFileSync(path.resolve(envPath), "utf8");
  const result = env.parse(buf.toString().trim());
  if (result.errors.length) {
    throw new FirebaseError(
      `Error while parsing ${envPath} - unable to parse following lines:\n${result.errors.join(
        "\n",
      )}`,
    );
  }
  return result.envs;
}

export function isSystemParam(paramName: string): boolean {
  const regex = /^firebaseextensions\.[a-zA-Z0-9\.]*\//;
  return regex.test(paramName);
}

export function partitionParams(params: Record<string, string>): {
  params: Record<string, string>;
  systemParams: Record<string, string>;
} {
  const userParams: Record<string, string> = {};
  const systemParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isSystemParam(key)) {
      systemParams[key] = value;
    } else {
      userParams[key] = value;
    }
  }
  return { params: userParams, systemParams };
}

// Populate default values for missing params.
// This is only needed when emulating extensions - when deploying, this is handled in the back end.
export function populateDefaultParams(
  params: Record<string, string>,
  spec: ExtensionSpec,
): Record<string, string> {
  const ret = { ...params };
  for (const p of spec.params) {
    ret[p.param] = ret[p.param] ?? p.default;
  }
  return ret;
}
