import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { prettify } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(options: Options, configDir: string): Promise<DeploymentMetadata> {
  var args: {configDir: string, projectId?: string} = { configDir }
  if (experiments.isEnabled("fdcconnectorevolution") && options.projectId) {
    process.env["DATA_CONNECT_PREVIEW"] = "conn_evolution"
    args.projectId = options.projectId
  }
  const buildResult = await DataConnectEmulator.build(args);
  if (buildResult?.errors?.length) {
    // TODO: Check for warning levels.
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
    );
  }
  return buildResult?.metadata ?? {};
}
