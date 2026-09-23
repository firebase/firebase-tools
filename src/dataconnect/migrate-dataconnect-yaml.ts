import { Options } from "../options";
import { Config } from "../config";
import { pickServices } from "./load";
import { EmulatorHub } from "../emulator/hub";
import { ConnectorConfig } from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import * as yaml from "yaml";
import * as path from "path";
import * as fs from "fs-extra";
import { FirebaseError } from "../error";

export async function migrate(
  projectId: string | undefined,
  config: Config | undefined,
  options: Options,
): Promise<boolean> {
  if (!config) {
    return false;
  }

  try {
    const serviceInfos = await pickServices(
      projectId || EmulatorHub.MISSING_PROJECT_PLACEHOLDER,
      config,
      options.service as string | undefined,
      options.location as string | undefined,
    );

    let isMigrated = false;

    for (const serviceInfo of serviceInfos) {
      const dataConnectYaml = serviceInfo.dataConnectYaml;
      const sourceDirectory = serviceInfo.sourceDirectory;

      if (!dataConnectYaml.connectorDirs || dataConnectYaml.connectorDirs.length === 0) {
        continue;
      }

      const connectors: ConnectorConfig[] = [];
      const newConnectorDirs: string[] = [];

      for (const dir of dataConnectYaml.connectorDirs) {
        const connectorDir = path.join(sourceDirectory, dir);
        const connectorYamlPath = path.join(connectorDir, "connector.yaml");

        if (!fs.existsSync(connectorYamlPath)) {
          newConnectorDirs.push(dir);
          continue;
        }

        const file = await readFileFromDirectory(connectorDir, "connector.yaml");
        const connectorYaml = await wrappedSafeLoad(file.source);

        const connectorId = connectorYaml.connectorId;
        const generate = connectorYaml.generate;

        if (generate) {
          if (generate.javascriptSdk) {
            const sdks = Array.isArray(generate.javascriptSdk)
              ? generate.javascriptSdk
              : [generate.javascriptSdk];
            for (const sdk of sdks) {
              connectors.push({
                id: connectorId,
                language: "javascript",
                appDir: sdk.packageJsonDir || "..", // Default to ..
                graphqlDirs: [dir],
                outputDir: sdk.outputDir,
                package: sdk.package,
              });
            }
          }
          if (generate.adminNodeSdk) {
            const sdks = Array.isArray(generate.adminNodeSdk)
              ? generate.adminNodeSdk
              : [generate.adminNodeSdk];
            for (const sdk of sdks) {
              connectors.push({
                id: connectorId,
                language: "admin-node",
                appDir: sdk.packageJsonDir || "..", // Default to ..
                graphqlDirs: [dir],
                outputDir: sdk.outputDir,
                package: sdk.package,
              });
            }
          }
          if (generate.dartSdk) {
            const sdks = Array.isArray(generate.dartSdk) ? generate.dartSdk : [generate.dartSdk];
            for (const sdk of sdks) {
              connectors.push({
                id: connectorId,
                language: "dart",
                appDir: "..",
                graphqlDirs: [dir],
                outputDir: sdk.outputDir,
                package: sdk.package,
              });
            }
          }
          if (generate.kotlinSdk) {
            const sdks = Array.isArray(generate.kotlinSdk)
              ? generate.kotlinSdk
              : [generate.kotlinSdk];
            for (const sdk of sdks) {
              connectors.push({
                id: connectorId,
                language: "kotlin",
                appDir: "..", // Note: Kotlin uses 'directory' in yaml, but our internal type uses 'appDir'. We'll need to update the yaml output.
                graphqlDirs: [dir],
                outputDir: sdk.outputDir,
                package: sdk.package,
              });
            }
          }
          if (generate.swiftSdk) {
            const sdks = Array.isArray(generate.swiftSdk) ? generate.swiftSdk : [generate.swiftSdk];
            for (const sdk of sdks) {
              connectors.push({
                id: connectorId,
                language: "swift",
                appDir: "..",
                graphqlDirs: [dir],
                outputDir: sdk.outputDir,
                package: sdk.package,
              });
            }
          }
        }

        // Delete connector.yaml
        fs.unlinkSync(connectorYamlPath);
        isMigrated = true;
      }

      if (isMigrated) {
        // Update dataconnect.yaml
        const dataconnectYamlPath = path.join(sourceDirectory, "dataconnect.yaml");
        const doc = yaml.parseDocument(fs.readFileSync(dataconnectYamlPath, "utf8"));

        if (!doc.has("connectors")) {
          doc.set("connectors", doc.createNode([]));
        }

        const connectorsSeq = doc.get("connectors");
        if (connectorsSeq && typeof connectorsSeq === "object" && "items" in connectorsSeq) {
          for (const connector of connectors) {
            (connectorsSeq.items as any[]).push(doc.createNode(connector));
          }
        }

        doc.delete("connectorDirs");

        fs.writeFileSync(dataconnectYamlPath, doc.toString(), "utf8");
      }
    }

    return isMigrated;
  } catch (err) {
    if (err instanceof FirebaseError) {
      // It's possible that no service matches, which throws an error.
      // We can just ignore it for migration purposes.
    } else {
      throw err;
    }
    return false;
  }
}
