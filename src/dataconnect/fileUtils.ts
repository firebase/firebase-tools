import * as fs from "fs-extra";
import * as path from "path";

import { FirebaseError } from "../error";
import { ConnectorYaml, DataConnectYaml, File } from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config } from "../config";

export function readFirebaseJson(config: Config): { source: string; location: string }[] {
  if (!config.has("dataconnect")) {
    return [];
  }
  const validator = (cfg: any) => {
    if (!cfg["source"] && !cfg["location"]) {
      throw new FirebaseError(
        "Invalid firebase.json: DataConnect requires `source` and `location`",
      );
    }
    return {
      source: cfg["source"],
      location: cfg["location"],
    };
  };
  const configs = config.get("dataconnect");
  if (typeof configs === "object" && !Array.isArray(configs)) {
    return [validator(configs)];
  } else if (Array.isArray(configs)) {
    return configs.map(validator);
  } else {
    throw new FirebaseError(
      "Invalid firebase.json: dataconnect should be of the form { source: string, location: string }",
    );
  }
}

export async function readDataConnectYaml(sourceDirectory: string): Promise<DataConnectYaml> {
  const file = await readFileFromDirectory(sourceDirectory, "dataconnect.yaml");
  const dataconnectYaml = await wrappedSafeLoad(file.source);
  return validateDataConnectYaml(dataconnectYaml);
}

function validateDataConnectYaml(unvalidated: any): DataConnectYaml {
  // TODO: Add validation
  return unvalidated as DataConnectYaml;
}

export async function readConnectorYaml(sourceDirectory: string): Promise<ConnectorYaml> {
  const file = await readFileFromDirectory(sourceDirectory, "connector.yaml");
  const connectorYaml = await wrappedSafeLoad(file.source);
  return validateConnectorYaml(connectorYaml);
}

function validateConnectorYaml(unvalidated: any): ConnectorYaml {
  // TODO: Add validation
  return unvalidated as ConnectorYaml;
}

export async function readGQLFiles(sourceDir: string): Promise<File[]> {
  const files = await fs.readdir(sourceDir);
  return files.filter((f) => f.endsWith(".gql")).map((f) => toFile(path.join(sourceDir, f)));
}

function toFile(path: string): File {
  if (!fs.existsSync(path)) {
    throw new FirebaseError(`file ${path} not found`);
  }
  const file = fs.readFileSync(path).toString();
  return {
    path: path,
    content: file,
  };
}
