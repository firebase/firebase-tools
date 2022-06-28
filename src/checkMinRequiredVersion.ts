/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
      `This command requires at least version ${minVersion} of the CLI to use. To update to the latest version using npm, run \`npm install -g firebase-tools\`. For other CLI management options, see https://firebase.google.com/docs/cli#update-cli`
    );
  }
}
