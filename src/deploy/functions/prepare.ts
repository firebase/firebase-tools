import * as _ from "lodash";
import * as clc from "cli-color";

import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import { logBullet } from "../../utils";
import { getRuntimeChoice } from "../../parseRuntimeAndValidateSDK";
import { getFunctionsInfo, promptForFailurePolicies } from "../../functionsDeployHelper";
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

  // Check what runtime to use, first in firebase.json then in 'engines' field.
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

  // Prepare the functions directory for upload, and set context.triggers
  logBullet(
    clc.cyan.bold("functions:") +
      " preparing " +
      clc.bold(options.config.get("functions.source")) +
      " directory for uploading..."
  );
  const source = await prepareFunctionsUpload(context, options);
  _.set(context, "functionsSource", source);

  // Get a list of CloudFunctioTriggers, with duplicates for each region.
  payload.functions = {};
  payload.functions.triggers = getFunctionsInfo(
    options.config.get("functions.triggers"),
    projectId
  );

  // Validate the function code that is being deployed.
  validate.functionsDirectoryExists(options, sourceDirName);
  validate.functionNamesAreValid(options); // TODO: define function names
  validate.packageJsonIsValid(sourceDirName, sourceDir, projectDir, !!runtimeFromConfig);

  // Display a warning and prompt if any functions have failurePolicies.
  await promptForFailurePolicies(options, payload.functions.triggers);
}
