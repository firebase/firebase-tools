"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalAppHostingConfiguration = void 0;
const path_1 = require("path");
const config_1 = require("../../apphosting/config");
const yaml_1 = require("../../apphosting/yaml");
/**
 * Loads in apphosting.yaml, apphosting.emulator.yaml & apphosting.local.yaml as an
 * overriding union. In order to keep apphosting.emulator.yaml safe to commit,
 * users cannot change a secret environment variable to plaintext.
 * apphosting.local.yaml can, however, for reverse compatibility, though its existence
 * will be downplayed and tooling will not assist in creating or managing it.
 */
async function getLocalAppHostingConfiguration(backendDir) {
    const appHostingConfigPaths = (0, config_1.listAppHostingFilesInPath)(backendDir);
    // generate a map to make it easier to interface between file name and it's path
    const fileNameToPathMap = Object.fromEntries(appHostingConfigPaths.map((path) => [(0, path_1.basename)(path), path]));
    const output = yaml_1.AppHostingYamlConfig.empty();
    const baseFilePath = fileNameToPathMap[config_1.APPHOSTING_BASE_YAML_FILE];
    const emulatorsFilePath = fileNameToPathMap[config_1.APPHOSTING_EMULATORS_YAML_FILE];
    const localFilePath = fileNameToPathMap[config_1.APPHOSTING_LOCAL_YAML_FILE];
    if (baseFilePath) {
        // N.B. merging from empty helps tests stay hermetic. I previously ran into a test bug where
        // using the returned value as the base caused the test stub to be modified and tests would succeed
        // independently but would fail as part of a suite.
        const baseFile = await yaml_1.AppHostingYamlConfig.loadFromFile(baseFilePath);
        output.merge(baseFile, /* allowSecretsToBecomePlaintext= */ false);
    }
    if (emulatorsFilePath) {
        const emulatorsConfig = await yaml_1.AppHostingYamlConfig.loadFromFile(emulatorsFilePath);
        output.merge(emulatorsConfig, /* allowSecretsToBecomePlaintext= */ false);
    }
    if (localFilePath) {
        const localYamlConfig = await yaml_1.AppHostingYamlConfig.loadFromFile(localFilePath);
        output.merge(localYamlConfig, /* allowSecretsToBecomePlaintext= */ true);
    }
    return output;
}
exports.getLocalAppHostingConfiguration = getLocalAppHostingConfiguration;
//# sourceMappingURL=config.js.map