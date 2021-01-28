import * as _ from "lodash";
import * as clc from "cli-color";

import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import { logBullet } from "../../utils";
import { getRuntimeChoice } from "../../parseRuntimeAndValidateSDK";
import {
  CloudFunctionTrigger,
  createFunctionsByRegionMap,
  flattenRegionMap,
  functionMatchesAnyGroup,
  getFilterGroups,
} from "../../functionsDeployHelper";
import { promptForFailurePolicies } from "./prompts";
import * as prepareFunctionsUpload from "../../prepareFunctionsUpload";
import * as validate from "./validate";
import { checkRuntimeDependencies } from "./checkRuntimeDependencies";

export async function prepare(context: any, options: any, payload: any): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const sourceDirName = options.config.get("functions.source");
  const sourceDir = options.config.path(sourceDirName);
  const projectDir = options.config.projectDir;
  const projectId = getProjectId(options);

  // Check what runtime to use, first in firebase.json, then in 'engines' field.
  const runtimeFromConfig = options.config.get("functions.runtime");
  context.runtimeChoice = getRuntimeChoice(sourceDir, runtimeFromConfig);

  // Check that all necessary APIs are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensureApiEnabled.ensure(options.project, "cloudfunctions.googleapis.com", "functions"),
    ensureApiEnabled.check(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true),
    checkRuntimeDependencies(projectId, context.runtimeChoice),
  ]);
  _.set(context, "runtimeConfigEnabled", checkAPIsEnabled[1]);

  // Get the Firebase Config.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  _.set(context, "firebaseConfig", firebaseConfig);

  // Prepare the functions directory for upload, and set context.triggers.
  logBullet(
    clc.cyan.bold("functions:") +
      " preparing " +
      clc.bold(options.config.get("functions.source")) +
      " directory for uploading..."
  );
  const source = await prepareFunctionsUpload(context, options);
  _.set(context, "functionsSource", source);

  // Get a list of CloudFunctionTriggers, with duplicates for each region.
  payload.functions = {};
  payload.functions.byRegion = createFunctionsByRegionMap(
    projectId,
    options.config.get("functions.triggers")
  );
  payload.functions.triggers = flattenRegionMap(payload.functions.byRegion);

  // Validate the function code that is being deployed.
  validate.functionsDirectoryExists(options, sourceDirName);
  // validate.functionNamesAreValid(payload.functionNames);
  // TODO: This doesn't do anything meaningful right now because payload.functions is not defined
  validate.packageJsonIsValid(sourceDirName, sourceDir, projectDir, !!runtimeFromConfig);

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  // Display a warning and prompt if any functions in the release have failurePolicies.
  const localFnsInRelease = payload.functions.triggers.filter((fn: CloudFunctionTrigger) => {
    return functionMatchesAnyGroup(fn.name, context.filters);
  });
  await promptForFailurePolicies(options, localFnsInRelease);
}
