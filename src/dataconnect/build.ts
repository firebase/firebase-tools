import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { prettify } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(options: Options, configDir: string, dryRun?: boolean): Promise<DeploymentMetadata> {
  var args: {configDir: string, projectId?: string} = { configDir }
  if (experiments.isEnabled("fdcconnectorevolution") && options.projectId) {
    process.env["DATA_CONNECT_PREVIEW"] = "conn_evolution"
    args.projectId = options.projectId
  }
  const buildResult = await DataConnectEmulator.build(args);
  if (buildResult?.errors?.length) {
    if (buildResult.errors.filter(e => !e.warningLevel)) {
      // Throw immediately if there are any build errors in the GraphQL schema or connectors.
      throw new FirebaseError(
        `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
      );
    } else {
      for (let e of buildResult.errors) {
        if (options.interactive) {
          if (dryRun || options.force) {
            // TODO: Log messages in output.
          } else {
            // TODO: Prompt messages and error if rejected.
            // Interactive default to accept, required default to reject.
          }
        } else if (options.nonInteractive) {
        }
      }
    }
  }
  return buildResult?.metadata ?? {};
}

async function prompt(options: Options): Promise<boolean> {
  return true;
}
