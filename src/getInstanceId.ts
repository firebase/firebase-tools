"use strict";

let _ = require("lodash");
let { getFirebaseProject } = require("./management/projects");

/**
 * Tries to determine the instance ID for the provided
 * project.
 * @param options The command-line options object
 * @returns The instance ID, empty if it doesn't exist.
 */
export default async function(options: any): Promise<string> {
  const projectDetails = await getFirebaseProject(options.project);
  if (!_.has(projectDetails, "resources.realtimeDatabaseInstance")) {
    return "";
  }
  return _.get(projectDetails, "resources.realtimeDatabaseInstance");
}
