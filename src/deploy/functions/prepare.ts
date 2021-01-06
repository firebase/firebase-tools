import * as _ from 'lodash';

import * as ensureApiEnabled from "../../ensureApiEnabled"
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import { getRuntimeChoice } from '../../parseRuntimeAndValidateSDK';
import * as validate from "./validate";
import { checkRuntimeDependencies } from "./checkRuntimeDependencies";

module.exports = exports = async function(context: any, options: any, payload:any): Promise<any> { // TODO: Can these params be typed?
  if (!options.config.has("functions")) {
    return;
  }

  var sourceDirName = options.config.get("functions.source");
  var sourceDir = options.config.path(sourceDirName);
  var projectDir = options.config.projectDir;
  var functionNames = payload.functions;
  var projectId = getProjectId(options);
  var runtimeFromConfig = options.config.get("functions.runtime");

  // Validate the function code that is being deployed. 
  validate.functionsDirectoryExists(options, sourceDirName);
  validate.functionNamesAreValid(functionNames);
  validate.packageJsonIsValid(sourceDirName, sourceDir, projectDir, !!runtimeFromConfig);

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

};
