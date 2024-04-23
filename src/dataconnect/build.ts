import { DataConnectEmulator, DataConnectEmulatorArgs } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { prettify } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(options: Options, configDir: string): Promise<DeploymentMetadata> {
  // We can build even if there is no project declared.
  const projectId = options.project ?? "demo-test";
  const args: DataConnectEmulatorArgs = {
    projectId,
    configDir,
    auto_download: true,
    rc: options.rc,
  };
  const dataconnectEmulator = new DataConnectEmulator(args);
  const buildResult = await dataconnectEmulator.build();
  if (buildResult?.errors?.length) {
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
    );
  }
  return buildResult?.metadata ?? {};
}
