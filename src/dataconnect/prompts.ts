import { confirm } from "../prompt";
import * as utils from "../utils";
import { deleteConnector, deleteSchema } from "./client";

export async function promptDeleteConnector(
  options: { force?: boolean; nonInteractive?: boolean },
  connectorName: string,
): Promise<void> {
  utils.logLabeledWarning(
    "dataconnect",
    `Connector ${connectorName} exists but is not listed in dataconnect.yaml.`,
  );
  const confirmDeletion = await confirm({
    default: false,
    message: `Do you want to delete ${connectorName}?`,
    force: options.force,
    nonInteractive: options.nonInteractive,
  });
  if (confirmDeletion) {
    await deleteConnector(connectorName);
    utils.logLabeledSuccess("dataconnect", `Connector ${connectorName} deleted`);
  }
}

export async function promptDeleteSchema(
  options: { force?: boolean; nonInteractive?: boolean },
  schemaName: string,
): Promise<void> {
  utils.logLabeledWarning(
    "dataconnect",
    `Schema ${schemaName} exists but is not listed in dataconnect.yaml.`,
  );
  const confirmDeletion = await confirm({
    default: false,
    message: `Do you want to delete the schema ${schemaName}?`,
    force: options.force,
    nonInteractive: options.nonInteractive,
  });
  if (confirmDeletion) {
    await deleteSchema(schemaName);
    utils.logLabeledSuccess("dataconnect", `Schema ${schemaName} deleted`);
  }
}
