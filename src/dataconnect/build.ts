import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { prettify } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(options: Options, configDir: string): Promise<DeploymentMetadata> {
  const buildResult = await DataConnectEmulator.build({ configDir });
  if (buildResult?.errors?.length) {
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
    );
  }
  return buildResult?.metadata ?? {};
}
