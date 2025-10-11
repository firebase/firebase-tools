import { DataConnectBuildArgs, DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { select } from "../prompt";
import * as utils from "../utils";
import { prettify, prettifyTable } from "./graphqlError";
import { DeploymentMetadata, GraphqlError, DeployStats } from "./types";
import { getProjectDefaultAccount } from "../auth";

export async function build(
  options: Options,
  configDir: string,
  deployStats: DeployStats,
  dryRun?: boolean,
): Promise<DeploymentMetadata> {
  const account = getProjectDefaultAccount(options.projectRoot);
  const args: DataConnectBuildArgs = { configDir, account };
  if (options.projectId) {
    args.projectId = options.projectId;
  }
  const buildResult = await DataConnectEmulator.build(args);
  if (buildResult?.errors?.length) {
    await handleBuildErrors(
      buildResult.errors,
      options.nonInteractive,
      options.force,
      deployStats,
      dryRun,
    );
  }
  return buildResult?.metadata ?? {};
}

export async function handleBuildErrors(
  errors: GraphqlError[],
  nonInteractive: boolean,
  force: boolean,
  deployStats: DeployStats,
  dryRun?: boolean,
) {
  if (errors.filter((w) => !w.extensions?.warningLevel).length) {
    // Throw immediately if there are any build errors in the GraphQL schema or connectors.
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${errors.map(prettify).join("\n")}`,
    );
  }

  const requiredForces = errors.filter((w) => w.extensions?.warningLevel === "REQUIRE_FORCE");
  if (requiredForces.length && !force) {
    // Only INACCESSIBLE issues fall in this category.
    utils.logLabeledError(
      "dataconnect",
      `There are changes in your schema or connectors that will result in broken behavior:\n` +
        prettifyTable(requiredForces),
    );
    throw new FirebaseError("Rerun this command with --force to deploy these changes.");
  }

  const interactiveAcks = errors.filter((w) => w.extensions?.warningLevel === "INTERACTIVE_ACK");
  const requiredAcks = errors.filter((w) => w.extensions?.warningLevel === "REQUIRE_ACK");
  const choices = [
    { name: "Acknowledge all changes and proceed", value: "proceed" },
    { name: "Reject changes and abort", value: "abort" },
  ];
  if (requiredAcks.length) {
    // This category contains BREAKING and INSECURE issues.
    utils.logLabeledWarning(
      "dataconnect",
      `There are changes in your schema or connectors that may break your existing applications or introduce operations that are insecure. These changes require explicit acknowledgement to proceed. You may either reject the changes and update your sources with the suggested workaround(s), if any, or acknowledge these changes and proceed with the deployment:\n` +
        prettifyTable(requiredAcks),
    );
    if (nonInteractive && !force) {
      deployStats.abort_build_warning = "true";
      throw new FirebaseError(
        "Explicit acknowledgement required for breaking schema or connector changes and new insecure operations. Rerun this command with --force to deploy these changes.",
      );
    } else if (!nonInteractive && !force && !dryRun) {
      const result = await select({
        message: "Would you like to proceed with these changes?",
        choices,
        default: "abort",
      });
      if (result === "abort") {
        deployStats.abort_build_warning = "true";
        throw new FirebaseError(`Deployment aborted.`);
      }
    }
    deployStats.ack_build_warning = "true";
  }
  if (interactiveAcks.length) {
    // This category contains WARNING and EXISTING_INSECURE issues.
    utils.logLabeledWarning(
      "dataconnect",
      `There are existing insecure operations or changes in your schema or connectors that may cause unexpected behavior in your existing applications:\n` +
        prettifyTable(interactiveAcks),
    );
    if (!nonInteractive && !force && !dryRun) {
      const result = await select({
        message: "Would you like to proceed with these changes?",
        choices,
        default: "proceed",
      });
      if (result === "abort") {
        deployStats.abort_build_warning = "true";
        throw new FirebaseError(`Deployment aborted.`);
      }
    }
    deployStats.ack_build_warning = "true";
  }
}
