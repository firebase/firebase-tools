import { FirebaseError } from "../error";

/**
 * Returns <environment> given an apphosting.<environment>.yaml file
 */
export function getEnvironmentName(apphostingYamlFileName: string): string {
  const envrionmentRegex = /apphosting\.(.+)\.yaml/;
  const found = apphostingYamlFileName.match(envrionmentRegex);

  if (!found) {
    throw new FirebaseError("Invalid apphosting environment file");
  }

  return found[1];
}
