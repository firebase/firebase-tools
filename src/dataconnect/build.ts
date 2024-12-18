import { DataConnectEmulator } from "../emulator/dataconnectEmulator.js";
import { Options } from "../options.js";
import { FirebaseError } from "../error.js";
import { prettify } from "./graphqlError.js";
import { DeploymentMetadata } from "./types.js";

export async function build(options: Options, configDir: string): Promise<DeploymentMetadata> {
  const buildResult = await DataConnectEmulator.build({ configDir });
  if (buildResult?.errors?.length) {
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
    );
  }
  return buildResult?.metadata ?? {};
}
