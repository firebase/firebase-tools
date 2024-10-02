import { readFileFromDirectory, wrappedSafeLoad } from "../../utils";

export type EnvironmentAvailability = "BUILD" | "RUNTIME";

const APPHOSTING_YAML = "apphosting.yaml";

interface AppHostingYaml {
  env?: {
    variable: string;
    secret?: string;
    value?: string;
    availability?: EnvironmentAvailability[];
  }[];
}

interface AppHostingConfiguration {
  environmentVariables?: { [key: string]: string };
  secrets?: { [key: string]: string };
}

export async function loadAppHostingYaml(
  sourceDirectory: string,
): Promise<AppHostingConfiguration> {
  const file = await readFileFromDirectory(sourceDirectory, APPHOSTING_YAML);
  const apphostingYaml: AppHostingYaml = await wrappedSafeLoad(file.source);

  const environmentVariables: { [key: string]: string } = {};
  const secrets: { [key: string]: string } = {};

  if (apphostingYaml.env) {
    apphostingYaml.env.map((env) => {
      if (env.value) {
        environmentVariables[env.variable] = env.value;
      }

      if (env.secret) {
        secrets[env.variable] = env.secret;
      }
    });
  }

  return { environmentVariables, secrets };
}
