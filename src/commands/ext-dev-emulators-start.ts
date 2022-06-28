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

// TODO(joehanley): Remove this entire command in v12.
import * as clc from "cli-color";
import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import { FirebaseError } from "../error";

export const command = new Command("ext:dev:emulators:start")
  .description("deprecated: please use `firebase emulators:start`")
  .before(commandUtils.setExportOnExitOptions)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_TEST_CONFIG, commandUtils.DESC_TEST_CONFIG)
  .option(commandUtils.FLAG_TEST_PARAMS, commandUtils.DESC_TEST_PARAMS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .option(commandUtils.FLAG_EXPORT_ON_EXIT, commandUtils.DESC_EXPORT_ON_EXIT)
  .action(() => {
    const localInstallCommand = `firebase ext:install ${process.cwd()}`;
    const emulatorsStartCommand = "firebase emulators:start";
    throw new FirebaseError(
      "ext:dev:emulators:start is no longer supported. " +
        "Instead, navigate to a Firebase project directory and add this extension to the extensions manifest by running:\n" +
        clc.bold(localInstallCommand) +
        "\nThen, you can emulate this extension as part of that project by running:\n" +
        clc.bold(emulatorsStartCommand)
    );
  });
