import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { prettify } from "./graphqlError";
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
    if (buildResult.errors.filter((w) => !w.warningLevel).length) {
      // Throw immediately if there are any build errors in the GraphQL schema or connectors.
      throw new FirebaseError(
        `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
      );
    }
    const interactiveAcks = buildResult.errors.filter(
      (w) => w.warningLevel && w.warningLevel === "INTERACTIVE_ACK",
    );
    const requiredAcks = buildResult.errors.filter(
      (w) => w.warningLevel && w.warningLevel === "REQUIRE_ACK",
    );
    if (requiredAcks.length) {
      if (options.nonInteractive && !options.force) {
        throw new FirebaseError(
          `There are changes in your schema or connectors that may break your existing applications. These changes require explicit acknowledgement to deploy:\n${requiredAcks.map(prettify).join("\n")}`,
        );
      } else if (options.interactive && !options.force && !dryRun) {
        // TODO: Prompt message and error if rejected. Default to reject.
      } else {
        // TODO: Log messages in output.
      }
    }
    if (interactiveAcks.length) {
      if (options.interactive && !options.force && !dryRun) {
        // TODO: Prompt message and error if rejected. Default to accept.
      } else {
        // TODO: Log messages in output.
      }
    }
  }
  return buildResult?.metadata ?? {};
}
