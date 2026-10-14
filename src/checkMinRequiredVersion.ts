import * as semver from "semver";

import { configstore } from "./configstore";
import { FirebaseError } from "./error";

const pkg = require("../package.json"); // eslint-disable-line @typescript-eslint/no-var-requires

/**
 * Checks if the CLI is on a recent enough version to use a command.
 * Errors if a min version is found and the CLI is below the minimum required version.
 * @param options
 * @param key the motd key to that contains semver for the min version for a command.
 */
export function checkMinRequiredVersion(options: any, key: string) {
  const minVersion = configstore.get(`motd.${key}`);
  if (minVersion && semver.gt(minVersion, pkg.version)) {
    throw new FirebaseError(
      `This command requires at least version ${minVersion} of the CLI to use. To update to the latest version using npm, run \`npm install -g firebase-tools\`. For other CLI management options, see https://firebase.google.com/docs/cli#update-cli`,
    );
  }
}
