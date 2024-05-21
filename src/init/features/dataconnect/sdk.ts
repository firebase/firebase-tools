import * as yaml from "yaml";
import * as fs from "fs-extra";
import { confirm, promptOnce } from "../../../prompt";
import * as clc from "colorette";
import * as path from "path";
import { readFirebaseJson } from "../../../dataconnect/fileUtils";
import { Config } from "../../../config";
import { Setup } from "../..";
import { load } from "../../../dataconnect/load";
import { logger } from "../../../logger";
import { ConnectorInfo, ConnectorYaml, JavascriptSDK } from "../../../dataconnect/types";
import { DataConnectEmulator, DataConnectEmulatorArgs } from "../../../emulator/dataconnectEmulator";
import { parseConnectorName } from "../../../dataconnect/names";

const IOS = "ios";
const WEB = "web";
const ANDROID = "android"
export async function doSetup(setup: Setup, config: Config): Promise<void> {

  const serviceCfgs = readFirebaseJson(config);
  const serviceInfos = await Promise.all(
    serviceCfgs.map((c) =>
      load(setup.projectId || "" , c.location, path.join(process.cwd(), c.source)),
    ),
  );
  const connectorChoices: { name: string, value: ConnectorInfo }[] = serviceInfos.map(si => {
    return si.connectorInfo.map( ci => {
      return {
        name: `${si.dataConnectYaml.serviceId}/${ci.connectorYaml.connectorId}`,
        value: ci,
      }
    })
  }).flat();
  if (!connectorChoices.length) {
    logger.info(`Your config has no connectors to set up SDKs for. Run ${
      clc.bold("firebase init dataconnect")
    } to set up a service and conenctors.`);
    return
  }
  const connectorInfo: ConnectorInfo = await promptOnce({
    message: "Which connector do you want set up a generated SDK for?",
    type: "list",
    choices: connectorChoices,
  });

  const platforms = await promptOnce({
    message: "Which platforms do you want to set up a generated SDK for?",
    type: "checkbox",
    choices: [
      {name: "iOS (Swift)", value: IOS},
      {name: "Web (JavaScript)", value: WEB},
      {name: "Androd (Kotlin)", value: ANDROID},
    ],
  })

  const newConnectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  if (!newConnectorYaml.generate) {
    newConnectorYaml.generate = {};
  }
  
  if (platforms.includes(IOS)) {
    const outputDir = await  promptOnce({
      message: "What directory do you want to write your Swift SDK code to?",
      type: "input",
    });
    const swiftSdk = { outputDir };
    newConnectorYaml.generate.swiftSdk = [
      ...(newConnectorYaml.generate.swiftSdk??[]),
      swiftSdk,
    ];
  }
  if (platforms.includes(WEB)) {
    const outputDir = await promptOnce({
      message: "What directory do you want to write your JavaScript SDK code to?",
      type: "input",
    });
    const pkg = await promptOnce({
      message: "What package name do you want to use for your JavaScript SDK?",
      type: "input",
      default: `@firebasegen/${connectorInfo.connectorYaml.connectorId}`
    });
    const packageJSONDir = await promptOnce({
      message: "Which directory contains the package.json that you would like to add the JavaScript SDK dependency to? (Leave black to skip)",
      type: "input",
    });
    const javascriptSdk: JavascriptSDK = { outputDir, package: pkg };
    if (packageJSONDir) {
      javascriptSdk.packageJSONDir = packageJSONDir;
    }
    newConnectorYaml.generate.javascriptSdk = [
      ...(newConnectorYaml.generate.javascriptSdk??[]),
      javascriptSdk,
    ];
  }
  if (platforms.includes(ANDROID)) {
    const outputDir = await promptOnce({
      message: "What directory do you want to write your Kotlin SDK code to?",
      type: "input",
    });
    const pkg = await promptOnce({
      message: "What package name do you want to use for your Kotlin SDK?",
      type: "input",
      default: `com.google.firebase.dataconnect.connectors.${connectorInfo.connectorYaml.connectorId}`
    });
    const kotlinSdk: JavascriptSDK = { outputDir, package: pkg };
    newConnectorYaml.generate.kotlinSdk = [
      ...(newConnectorYaml.generate.kotlinSdk??[]),
      kotlinSdk,
    ];
  }
  const connectorYamlContents = yaml.stringify(newConnectorYaml);
  const connectorYamlPath = `${connectorInfo.directory}/connector.yaml`;
  fs.writeFileSync(connectorYamlPath, connectorYamlContents, "utf8");
  logger.info(`Wrote new config to ${connectorYamlPath}`);
  if (setup.projectId && await confirm({
    message: "Would you like to generate SDK code now?",
    default: true,
  })) {
    const location = parseConnectorName(connectorInfo.connector.name).location;
    
    const args: DataConnectEmulatorArgs = {
      projectId: setup.projectId,
      configDir: connectorInfo.directory,
      auto_download: true,
      locationId: location,
      localConnectionString: "",
    };
    const dataconnectEmulator = new DataConnectEmulator(args);
    const output = await dataconnectEmulator.generate(connectorInfo.connectorYaml.connectorId);
    console.log(output);
    logger.info(`Generated SDK code for ${connectorInfo.connectorYaml.connectorId}`)
  }
}
