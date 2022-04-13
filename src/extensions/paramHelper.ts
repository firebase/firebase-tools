import * as path from "path";
import * as clc from "cli-color";
import * as fs from "fs-extra";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as extensionsApi from "./extensionsApi";
import {
  getFirebaseProjectParams,
  populateDefaultParams,
  substituteParams,
  validateCommandLineParams,
} from "./extensionsHelper";
import * as askUserForParam from "./askUserForParam";
import { track } from "../track";
import * as env from "../functions/env";
import { cloneDeep } from "../utils";

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
export function setNewDefaults(
  params: extensionsApi.Param[],
  newDefaults: { [key: string]: string }
): extensionsApi.Param[] {
  params.forEach((param) => {
    if (newDefaults[param.param.toUpperCase()]) {
      param.default = newDefaults[param.param.toUpperCase()];
    }
  });
  return params;
}

/**
 * Returns a copy of the params for a extension instance with the defaults set to the instance's current param values
 * @param extensionInstance the extension instance to change the default params of
 */
export function getParamsWithCurrentValuesAsDefaults(
  extensionInstance: extensionsApi.ExtensionInstance
): extensionsApi.Param[] {
  const specParams = cloneDeep(extensionInstance?.config?.source?.spec?.params || []);
  const currentParams = cloneDeep(extensionInstance?.config?.params || {});
  return setNewDefaults(specParams, currentParams);
}

/**
 * Gets params from the user, either by
 * reading the env file passed in the --params command line option
 * or prompting the user for each param.
 * @param projectId the id of the project in use
 * @param paramSpecs a list of params, ie. extensionSpec.params
 * @param envFilePath a path to an env file containing param values
 * @throws FirebaseError if an invalid env file is passed in
 */
export async function getParams(args: {
  projectId?: string;
  instanceId: string;
  paramSpecs: extensionsApi.Param[];
  nonInteractive?: boolean;
  paramsEnvPath?: string;
  reconfiguring?: boolean;
}): Promise<Record<string, ParamBindingOptions>> {
  let params: Record<string, ParamBindingOptions>;
  if (args.nonInteractive && !args.paramsEnvPath) {
    const paramsMessage = args.paramSpecs
      .map((p) => {
        return `\t${p.param}${p.required ? "" : " (Optional)"}`;
      })
      .join("\n");
    throw new FirebaseError(
      "In non-interactive mode but no `--params` flag found. " +
        "To install this extension in non-interactive mode, set `--params` to a path to an .env file" +
        " containing values for this extension's params:\n" +
        paramsMessage
    );
  } else if (args.paramsEnvPath) {
    params = getParamsFromFile({
      paramSpecs: args.paramSpecs,
      paramsEnvPath: args.paramsEnvPath,
    });
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
  const paramNames = Object.keys(params);
  void track("Extension Params", paramNames.length ? "Not Present" : "Present", paramNames.length);
  return params;
}

export async function getParamsForUpdate(args: {
  spec: extensionsApi.ExtensionSpec;
  newSpec: extensionsApi.ExtensionSpec;
  currentParams: { [option: string]: string };
  projectId?: string;
  paramsEnvPath?: string;
  nonInteractive?: boolean;
  instanceId: string;
}): Promise<Record<string, ParamBindingOptions>> {
  let params: Record<string, ParamBindingOptions>;
  if (args.nonInteractive && !args.paramsEnvPath) {
    const paramsMessage = args.newSpec.params
      .map((p) => {
        return `\t${p.param}${p.required ? "" : " (Optional)"}`;
      })
      .join("\n");
    throw new FirebaseError(
      "In non-interactive mode but no `--params` flag found. " +
        "To update this extension in non-interactive mode, set `--params` to a path to an .env file" +
        " containing values for this extension's params:\n" +
        paramsMessage
    );
  } else if (args.paramsEnvPath) {
    params = getParamsFromFile({
      paramSpecs: args.newSpec.params,
      paramsEnvPath: args.paramsEnvPath,
    });
  } else {
    params = await promptForNewParams({
      spec: args.spec,
      newSpec: args.newSpec,
      currentParams: args.currentParams,
      projectId: args.projectId,
      instanceId: args.instanceId,
    });
  }
  const paramNames = Object.keys(params);
  void track("Extension Params", paramNames.length ? "Not Present" : "Present", paramNames.length);
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
  spec: extensionsApi.ExtensionSpec;
  newSpec: extensionsApi.ExtensionSpec;
  currentParams: { [option: string]: string };
  projectId?: string;
  instanceId: string;
}): Promise<{ [option: string]: ParamBindingOptions }> {
  const newParamBindingOptions = buildBindingOptionsWithBaseValue(args.currentParams);

  const firebaseProjectParams = await getFirebaseProjectParams(args.projectId);
  const sameParam = (param1: extensionsApi.Param) => (param2: extensionsApi.Param) => {
    return param1.type === param2.type && param1.param === param2.param;
  };
  const paramDiff = (
    left: extensionsApi.Param[],
    right: extensionsApi.Param[]
  ): extensionsApi.Param[] => {
    return left.filter((aLeft) => !right.find(sameParam(aLeft)));
  };

  // Some params are in the spec but not in currentParams, remove so we can prompt for them.
  const oldParams = args.spec.params.filter((p) =>
    Object.keys(args.currentParams).includes(p.param)
  );

  let paramsDiffDeletions = paramDiff(oldParams, args.newSpec.params);
  paramsDiffDeletions = substituteParams<extensionsApi.Param[]>(
    paramsDiffDeletions,
    firebaseProjectParams
  );

  let paramsDiffAdditions = paramDiff(args.newSpec.params, oldParams);
  paramsDiffAdditions = substituteParams<extensionsApi.Param[]>(
    paramsDiffAdditions,
    firebaseProjectParams
  );

  if (paramsDiffDeletions.length) {
    logger.info("The following params will no longer be used:");
    for (const param of paramsDiffDeletions) {
      logger.info(clc.red(`- ${param.param}: ${args.currentParams[param.param.toUpperCase()]}`));
      delete newParamBindingOptions[param.param.toUpperCase()];
    }
  }
  if (paramsDiffAdditions.length) {
    logger.info("To update this instance, configure the following new parameters:");
    for (const param of paramsDiffAdditions) {
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

function getParamsFromFile(args: {
  paramSpecs: extensionsApi.Param[];
  paramsEnvPath: string;
}): Record<string, ParamBindingOptions> {
  let envParams;
  try {
    envParams = readEnvFile(args.paramsEnvPath);
    void track("Extension Env File", "Present");
  } catch (err: any) {
    void track("Extension Env File", "Invalid");
    throw new FirebaseError(`Error reading env file: ${err.message}\n`, { original: err });
  }
  const params = populateDefaultParams(envParams, args.paramSpecs);
  validateCommandLineParams(params, args.paramSpecs);
  logger.info(`Using param values from ${args.paramsEnvPath}`);

  return buildBindingOptionsWithBaseValue(params);
}

export function readEnvFile(envPath: string): Record<string, string> {
  const buf = fs.readFileSync(path.resolve(envPath), "utf8");
  const result = env.parse(buf.toString().trim());
  if (result.errors.length) {
    throw new FirebaseError(
      `Error while parsing ${envPath} - unable to parse following lines:\n${result.errors.join(
        "\n"
      )}`
    );
  }
  return result.envs;
}
