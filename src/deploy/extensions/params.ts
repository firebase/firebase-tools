import * as path from "path";
import { logger } from "../../logger";

import { readEnvFile } from "../../extensions/paramHelper";
import { FirebaseError } from "../../error";

const ENV_DIRECTORY = "extensions";

/**
 * readParams gets the params for an extension instance from the `extensions` folder,
 * checking for project specific env files, then falling back to generic env files.
 * This checks the following locations & if a param is defined in multiple places, it prefers
 * whichever is higher on this list:
 *  - extensions/{instanceId}.env.{projectID}
 *  - extensions/{instanceId}.env.{projectNumber}
 *  - extensions/{instanceId}.env.{projectAlias}
 *  - extensions/{instanceId}.env
 */
export function readParams(args: {
  projectDir: string;
  projectId: string;
  projectNumber: string;
  aliases: string[];
  instanceId: string;
}): Record<string, string> {
  const filesToCheck = [
    `${args.instanceId}.env`,
    ...args.aliases.map((alias) => `${args.instanceId}.env.${alias}`),
    `${args.instanceId}.env.${args.projectNumber}`,
    `${args.instanceId}.env.${args.projectId}`,
  ];
  let noFilesFound = true;
  const combinedParams = {};
  for (const fileToCheck of filesToCheck) {
    try {
      const params = readParamsFile(args.projectDir, fileToCheck);
      logger.debug(`Successfully read params from ${fileToCheck}`);
      noFilesFound = false;
      Object.assign(combinedParams, params);
    } catch (err: any) {
      logger.debug(`${err}`);
    }
  }
  if (noFilesFound) {
    throw new FirebaseError(`No params file found for ${args.instanceId}`);
  }
  return combinedParams;
}

function readParamsFile(projectDir: string, fileName: string): Record<string, string> {
  const paramPath = path.join(projectDir, ENV_DIRECTORY, fileName);
  const params = readEnvFile(paramPath);
  return params as Record<string, string>;
}
