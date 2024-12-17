import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { Options } from "../options";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { prettify } from "./graphqlError";
import { DeploymentMetadata } from "./types";

export async function build(options: Options, configDir: string): Promise<DeploymentMetadata> {
  const buildResult = await DataConnectEmulator.build({ configDir });

  if (options.interactive) {
    utils.logLabeledBullet("TEST", "is interactive");
  } else {
    utils.logLabeledBullet("TEST", "is not interactive");
  }
  if (options.nonInteractive) {
    utils.logLabeledBullet("TEST", "is nonInteractive");
  } else {
    utils.logLabeledBullet("TEST", "is not nonInteractive");
  }

  if (buildResult?.errors?.length) {
    throw new FirebaseError(
      `There are errors in your schema and connector files:\n${buildResult.errors.map(prettify).join("\n")}`,
    );
  }
  return buildResult?.metadata ?? {};
}
