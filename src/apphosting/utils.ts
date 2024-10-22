import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config as AppHostingYaml, AppHostingReadableConfiguration } from "./config";

/**
 * Reads an apphosting.*.yaml file, parses, and returns in an easy to use
 * format.
 */
export async function loadAppHostingYaml(
  sourceDirectory: string,
  fileName: string,
): Promise<AppHostingReadableConfiguration> {
  const file = await readFileFromDirectory(sourceDirectory, fileName);
  const apphostingYaml: AppHostingYaml = await wrappedSafeLoad(file.source);
  const environmentVariables: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  if (apphostingYaml.env) {
    for (const env of apphostingYaml.env) {
      if (env.value) {
        environmentVariables[env.variable] = env.value;
      }

      if (env.secret) {
        secrets[env.variable] = env.secret;
      }
    }
  }

  return { environmentVariables, secrets };
}
