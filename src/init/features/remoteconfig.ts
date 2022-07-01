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

import { promptOnce } from "../../prompt";
import fsutils = require("../../fsutils");
import clc = require("cli-color");
import { Config } from "../../config";

interface RemoteConfig {
  template?: string;
}
interface SetUpConfig {
  remoteconfig: RemoteConfig;
}
interface RemoteConfigSetup {
  config: SetUpConfig;
}

/**
 * Function retrieves names for parameters and parameter groups
 * @param setup Input is of RemoteConfigSetup defined in interfaces above
 * @param config Input is of type Config
 * @return {Promise} Returns a promise and writes the project file for remoteconfig template when initializing
 */
export async function doSetup(setup: RemoteConfigSetup, config: Config): Promise<void> {
  setup.config.remoteconfig = {};
  const jsonFilePath = await promptOnce({
    type: "input",
    name: "template",
    message: "What file should be used for your Remote Config template?",
    default: "remoteconfig.template.json",
  });
  if (fsutils.fileExistsSync(jsonFilePath)) {
    const msg =
      "File " +
      clc.bold(jsonFilePath) +
      " already exists." +
      " Do you want to overwrite the existing Remote Config template?";
    const overwrite = await promptOnce({
      type: "confirm",
      message: msg,
      default: false,
    });
    if (!overwrite) {
      return;
    }
  }
  setup.config.remoteconfig.template = jsonFilePath;
  config.writeProjectFile(setup.config.remoteconfig.template, "{}");
}
