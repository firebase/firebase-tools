import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { promptOnce } from "../prompt";
import * as utils from "../utils";
import { prettify, prettifyWithWorkaround } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(
  options: Options,
  configDir: string,
  dryRun?: boolean,
): Promise<DeploymentMetadata> {
  const args: { configDir: string; projectId?: string } = { configDir };
  if (experiments.isEnabled("fdcconnectorevolution") && options.projectId) {
    process.env["DATA_CONNECT_PREVIEW"] = "conn_evolution";
    args.projectId = options.projectId;
  }
  const buildResult = await DataConnectEmulator.build(args);
  if (buildResult?.errors?.length) {
    if (buildResult.errors.filter((w) => !w.extensions?.warningLevel).length) {
      // Throw immediately if there are any build errors in the GraphQL schema or connectors.
      throw new FirebaseError(
        `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
      );
    }
    const interactiveAcks = buildResult.errors.filter(
      (w) => w.extensions?.warningLevel && w.extensions?.warningLevel === "INTERACTIVE_ACK",
    );
    const requiredAcks = buildResult.errors.filter(
      (w) => w.extensions?.warningLevel && w.extensions?.warningLevel === "REQUIRE_ACK",
    );
    const choices = [
      { name: "Acknowledge all changes and proceed", value: "proceed" },
      { name: "Reject changes and abort", value: "abort" },
    ];
    if (requiredAcks.length) {
      utils.logLabeledWarning(
        "dataconnect",
        `There are changes in your schema or connectors that may break your existing applications. These changes require explicit acknowledgement to proceed. You may either reject the changes and update your sources with the suggested workaround(s), if any, or acknowledge these changes and proceed with the deployment:\n` +
          requiredAcks.map(prettifyWithWorkaround).join("\n"),
      );
      if (options.nonInteractive && !options.force) {
        throw new FirebaseError(
          "Explicit acknowledgement required for breaking schema or connector changes.",
        );
      } else if (!options.nonInteractive && !options.force && !dryRun) {
        const result = await promptOnce({
          message: "Would you like to proceed with these breaking changes?",
          type: "list",
          choices,
          default: "abort",
        });
        if (result === "abort") {
          throw new FirebaseError(`Deployment aborted.`);
        }
      }
    }
    if (interactiveAcks.length) {
      utils.logLabeledWarning(
        "dataconnect",
        `There are changes in your schema or connectors that may cause unexpected behavior in your existing applications:\n` +
          interactiveAcks.map(prettify).join("\n"),
      );
      if (!options.nonInteractive && !options.force && !dryRun) {
        const result = await promptOnce({
          message: "Would you like to proceed with these changes?",
          type: "list",
          choices,
          default: "proceed",
        });
        if (result === "abort") {
          throw new FirebaseError(`Deployment aborted.`);
        }
      }
    }
  }
  return buildResult?.metadata ?? {};
}
