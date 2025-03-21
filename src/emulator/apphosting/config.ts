import { basename } from "path";
import {
  APPHOSTING_BASE_YAML_FILE,
  APPHOSTING_EMULATORS_YAML_FILE,
  APPHOSTING_LOCAL_YAML_FILE,
  listAppHostingFilesInPath,
} from "../../apphosting/config";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

/**
 * Loads in apphosting.yaml, apphosting.emulator.yaml & apphosting.local.yaml as an
 * overriding union. In order to keep apphosting.emulator.yaml safe to commit,
 * users cannot change a secret environment variable to plaintext.
 * apphosting.local.yaml can, however, for reverse compatibility, though its existence
 * will be downplayed and tooling will not assist in creating or managing it.
 */
export async function getLocalAppHostingConfiguration(
  backendDir: string,
): Promise<AppHostingYamlConfig> {
  const appHostingConfigPaths = listAppHostingFilesInPath(backendDir);
  // generate a map to make it easier to interface between file name and it's path
  const fileNameToPathMap = Object.fromEntries(
    appHostingConfigPaths.map((path) => [basename(path), path]),
  );

  const output = AppHostingYamlConfig.empty();

  const baseFilePath = fileNameToPathMap[APPHOSTING_BASE_YAML_FILE];
  const emulatorsFilePath = fileNameToPathMap[APPHOSTING_EMULATORS_YAML_FILE];
  const localFilePath = fileNameToPathMap[APPHOSTING_LOCAL_YAML_FILE];

  if (baseFilePath) {
    // N.B. merging from empty helps tests stay hermetic. I previously ran into a test bug where
    // using the returned value as the base caused the test stub to be modified and tests would succeed
    // independently but would fail as part of a suite.
    const baseFile = await AppHostingYamlConfig.loadFromFile(baseFilePath);
    output.merge(baseFile, /* allowSecretsToBecomePlaintext= */ false);
  }

  if (emulatorsFilePath) {
    const emulatorsConfig = await AppHostingYamlConfig.loadFromFile(emulatorsFilePath);
    output.merge(emulatorsConfig, /* allowSecretsToBecomePlaintext= */ false);
  }

  if (localFilePath) {
    const localYamlConfig = await AppHostingYamlConfig.loadFromFile(localFilePath);
    output.merge(localYamlConfig, /* allowSecretsToBecomePlaintext= */ true);
  }

  return output;
}
