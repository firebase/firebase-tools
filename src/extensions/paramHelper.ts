import * as _ from "lodash";
import * as path from "path";
import * as clc from "cli-color";
import * as dotenv from "dotenv";
import * as fs from "fs-extra";

import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as modsApi from "./modsApi";
import {
  getFirebaseProjectParams,
  populateDefaultParams,
  substituteParams,
  validateCommandLineParams,
} from "./modsHelper";
import * as askUserForParam from "./askUserForParam";
import * as track from "../track";

/**
 * A mutator to switch the defaults for a list of params to new ones.
 * For convenience, this also returns the params
 *
 * @param params A list of params
 * @param newDefaults a map of { PARAM_NAME: default_value }
 */
function setNewDefaults(
  params: modsApi.Param[],
  newDefaults: { [key: string]: string }
): modsApi.Param[] {
  params.forEach((param) => {
    if (newDefaults[param.param.toUpperCase()]) {
      param.default = newDefaults[param.param.toUpperCase()];
    }
  });
  return params;
}

/**
 * Returns a copy of the params for a mod instance with the defaults set to the instance's current param values
 * @param modInstance the mod instance to change the default params of
 */
export function getParamsWithCurrentValuesAsDefaults(
  modInstance: modsApi.ModInstance
): modsApi.Param[] {
  const specParams = _.cloneDeep(_.get(modInstance, "configuration.source.spec.params", []));
  const currentParams = _.cloneDeep(_.get(modInstance, "configuration.params", {}));
  return setNewDefaults(specParams, currentParams);
}

/**
 * Gets params from the user, either by
 * reading the env file passed in the --params command line option
 * or prompting the user for each param.
 * @param projectId the id of the project in use
 * @param paramSpecs a list of params, ie. modSpec.params
 * @param envFilePath a path to an env file containing param values
 * @throws FirebaseError if an invalid env file is passed in
 */
export async function getParams(
  projectId: string,
  paramSpecs: modsApi.Param[],
  envFilePath?: string
): Promise<{ [key: string]: string }> {
  let commandLineParams;
  if (envFilePath) {
    try {
      const buf = fs.readFileSync(path.resolve(envFilePath));
      commandLineParams = dotenv.parse(buf.toString().trim(), { debug: true });
      track("Mod Env File", "Present");
    } catch (err) {
      track("Mod Env File", "Invalid");
      throw new FirebaseError(`Error reading env file: ${err.message}\n`, { original: err });
    }
  } else {
    track("Mod Env File", "Not Present");
  }
  const firebaseProjectParams = await getFirebaseProjectParams(projectId);
  let params: any;
  if (commandLineParams) {
    params = populateDefaultParams(commandLineParams, paramSpecs);
    validateCommandLineParams(params, paramSpecs);
  } else {
    params = await askUserForParam.ask(paramSpecs, firebaseProjectParams);
  }
  track("Mod Params", _.isEmpty(params) ? "Not Present" : "Present", _.size(params));
  return params;
}

/**
 * Displays params that exist in spec but not newSpec,
 * and then prompts user for any params in newSpec that are not in spec.
 *
 * @param spec A current modSpec
 * @param newSpec A modSpec to compare to
 * @param currentParams A set of current params and their values
 */
export async function promptForNewParams(
  spec: modsApi.ModSpec,
  newSpec: modsApi.ModSpec,
  currentParams: { [option: string]: string },
  projectId: string
): Promise<any> {
  const firebaseProjectParams = await getFirebaseProjectParams(projectId);

  let paramsDiffDeletions = _.differenceWith(spec.params, _.get(newSpec, "params", []), _.isEqual);
  paramsDiffDeletions = substituteParams(paramsDiffDeletions, firebaseProjectParams);

  let paramsDiffAdditions = _.differenceWith(newSpec.params, _.get(spec, "params", []), _.isEqual);
  paramsDiffAdditions = substituteParams(paramsDiffAdditions, firebaseProjectParams);

  if (paramsDiffDeletions.length) {
    logger.info("The following params will no longer be used:");
    paramsDiffDeletions.forEach((param) => {
      logger.info(clc.red(`- ${param.param}: ${currentParams[param.param.toUpperCase()]}`));
      delete currentParams[param.param.toUpperCase()];
    });
  }
  if (paramsDiffAdditions.length) {
    logger.info("Please configure the following new params:");
    for (const param of paramsDiffAdditions) {
      const chosenValue = await askUserForParam.askForParam(param);
      currentParams[param.param] = chosenValue;
    }
  }
  return currentParams;
}
