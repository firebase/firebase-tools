import * as yaml from "yaml";
import * as fs from "fs";
import * as clc from "colorette";

import { confirm, promptOnce } from "../../../prompt";
import { readFirebaseJson } from "../../../dataconnect/fileUtils";
import { Config } from "../../../config";
import { Setup } from "../..";
import { load } from "../../../dataconnect/load";
import { logger } from "../../../logger";
import { ConnectorInfo, ConnectorYaml, JavascriptSDK, KotlinSDK } from "../../../dataconnect/types";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { FirebaseError } from "../../../error";
import { camelCase, snakeCase } from "lodash";

const IOS = "ios";
const WEB = "web";
const ANDROID = "android";
export type SDKInfo = {
  connectorYamlContents: string;
  connectorInfo: ConnectorInfo;
  shouldGenerate: boolean;
};
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const sdkInfo = await askQuestions(setup, config);
  await actuate(sdkInfo, setup.projectId);
}

async function askQuestions(setup: Setup, config: Config): Promise<SDKInfo> {
  const serviceCfgs = readFirebaseJson(config);
  const serviceInfos = await Promise.all(
    serviceCfgs.map((c) => load(setup.projectId || "", config, c.source)),
  );
  const connectorChoices: { name: string; value: ConnectorInfo }[] = serviceInfos
    .map((si) => {
      return si.connectorInfo.map((ci) => {
        return {
          name: `${si.dataConnectYaml.serviceId}/${ci.connectorYaml.connectorId}`,
          value: ci,
        };
      });
    })
    .flat();
  if (!connectorChoices.length) {
    throw new FirebaseError(
      `Your config has no connectors to set up SDKs for. Run ${clc.bold(
        "firebase init dataconnect",
      )} to set up a service and conenctors.`,
    );
  }
  const connectorInfo: ConnectorInfo = await promptOnce({
    message: "Which connector do you want set up a generated SDK for?",
    type: "list",
    choices: connectorChoices,
  });

  let platforms: string[] = [];
  while (!platforms.length) {
    platforms = await promptOnce({
      message: "Which platforms do you want to set up a generated SDK for?",
      type: "checkbox",
      choices: [
        { name: "iOS (Swift)", value: IOS },
        { name: "Web (JavaScript)", value: WEB },
        { name: "Androd (Kotlin)", value: ANDROID },
      ],
    });
    if (!platforms.length) {
      logger.info("You must pick at least one platform.");
    }
  }

  const newConnectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  if (!newConnectorYaml.generate) {
    newConnectorYaml.generate = {};
  }

  if (platforms.includes(IOS)) {
    const outputDir = await promptOnce({
      message: `What directory do you want to write your Swift SDK code to? (If not absolute, path will be relative to '${connectorInfo.directory}')`,
      type: "input",
      default:
        newConnectorYaml.generate.swiftSdk?.outputDir ||
        `./../gensdk/${newConnectorYaml.connectorId}/swift-sdk`,
    });
    const pkg = camelCase(newConnectorYaml.connectorId);
    const swiftSdk = { outputDir, package: pkg };
    newConnectorYaml.generate.swiftSdk = swiftSdk;
  }
  if (platforms.includes(WEB)) {
    const outputDir = await promptOnce({
      message: `What directory do you want to write your JavaScript SDK code to? (If not absolute, path will be relative to '${connectorInfo.directory}')`,
      type: "input",
      default:
        newConnectorYaml.generate.javascriptSdk?.outputDir ||
        `./../gensdk/${newConnectorYaml.connectorId}/javascript-sdk`,
    });
    const pkg =
      newConnectorYaml.generate.javascriptSdk?.package ??
      `@firebasegen/${connectorInfo.connectorYaml.connectorId}`;
    const packageJSONDir = await promptOnce({
      message:
        "Which directory contains the package.json that you would like to add the JavaScript SDK dependency to? (Leave blank to skip)",
      type: "input",
      default: newConnectorYaml.generate.javascriptSdk?.packageJSONDir,
    });
    // ../.. since we ask relative to connector.yaml
    const javascriptSdk: JavascriptSDK = {
      outputDir,
      package: pkg,
    };
    if (packageJSONDir) {
      javascriptSdk.packageJSONDir = packageJSONDir;
    }
    newConnectorYaml.generate.javascriptSdk = javascriptSdk;
  }
  if (platforms.includes(ANDROID)) {
    const outputDir = await promptOnce({
      message: `What directory do you want to write your Kotlin SDK code to? (If not absolute, path will be relative to '${connectorInfo.directory}')`,
      type: "input",
      default:
        newConnectorYaml.generate.kotlinSdk?.outputDir ||
        `./../gensdk/${newConnectorYaml.connectorId}/kotlin-sdk`,
    });
    const pkg =
      newConnectorYaml.generate.kotlinSdk?.package ??
      `connectors.${snakeCase(connectorInfo.connectorYaml.connectorId)}`;
    const kotlinSdk: KotlinSDK = {
      outputDir,
      package: pkg,
    };
    newConnectorYaml.generate.kotlinSdk = kotlinSdk;
  }

  const shouldGenerate = !!(
    setup.projectId &&
    (await confirm({
      message: "Would you like to generate SDK code now?",
      default: true,
    }))
  );
  // TODO: Prompt user about adding generated paths to .gitignore
  const connectorYamlContents = yaml.stringify(newConnectorYaml);
  return { connectorYamlContents, connectorInfo, shouldGenerate };
}

export async function actuate(sdkInfo: SDKInfo, projectId?: string) {
  const connectorYamlPath = `${sdkInfo.connectorInfo.directory}/connector.yaml`;
  fs.writeFileSync(connectorYamlPath, sdkInfo.connectorYamlContents, "utf8");
  logger.info(`Wrote new config to ${connectorYamlPath}`);
  if (projectId && sdkInfo.shouldGenerate) {
    await DataConnectEmulator.generate({
      configDir: sdkInfo.connectorInfo.directory,
      connectorId: sdkInfo.connectorInfo.connectorYaml.connectorId,
    });
    logger.info(`Generated SDK code for ${sdkInfo.connectorInfo.connectorYaml.connectorId}`);
  }
}
