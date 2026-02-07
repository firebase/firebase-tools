import { AppHostingYamlConfig } from "../../apphosting/yaml";
import { getAppHostingConfiguration } from "../../apphosting/config";

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
  return getAppHostingConfiguration(backendDir, { allowEmulator: true, allowLocal: true });
}
