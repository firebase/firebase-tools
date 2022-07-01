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

import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as spawn from "cross-spawn";

import { FirebaseError } from "../../../error";
import { Config } from "../../../config";
import { promptOnce } from "../../../prompt";
import * as utils from "../../../utils";
import * as go from "../../../deploy/functions/runtimes/golang";
import { logger } from "../../../logger";

const clc = require("cli-color");

const RUNTIME_VERSION = "1.13";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/golang");
const MAIN_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "functions.go"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

async function init(setup: unknown, config: Config) {
  await writeModFile(config);

  const modName = config.get("functions.go.module") as string;
  const [pkg] = modName.split("/").slice(-1);
  await config.askWriteProjectFile("functions/functions.go", MAIN_TEMPLATE.replace("PACKAGE", pkg));
  await config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
}

// writeModFile is meant to look like askWriteProjectFile but it generates the contents
// dynamically using the go tool
async function writeModFile(config: Config) {
  const modPath = config.path("functions/go.mod");
  if (await promisify(fs.exists)(modPath)) {
    const shoudlWriteModFile = await promptOnce({
      type: "confirm",
      message: "File " + clc.underline("functions/go.mod") + " already exists. Overwrite?",
      default: false,
    });
    if (!shoudlWriteModFile) {
      return;
    }

    // Go will refuse to overwrite an existing mod file.
    await promisify(fs.unlink)(modPath);
  }

  // Nit(inlined) can we look at functions code and see if there's a domain mapping?
  const modName = await promptOnce({
    type: "input",
    message: "What would you like to name your module?",
    default: "acme.com/functions",
  });
  config.set("functions.go.module", modName);

  // Manually create a go mod file because (A) it's easier this way and (B) it seems to be the only
  // way to set the min Go version to anything but what the user has installed.
  config.writeProjectFile("functions/go.mod", `module ${modName} \n\ngo ${RUNTIME_VERSION}\n\n`);
  utils.logSuccess("Wrote " + clc.bold("functions/go.mod"));

  for (const dep of [go.FUNCTIONS_SDK, go.ADMIN_SDK, go.FUNCTIONS_CODEGEN, go.FUNCTIONS_RUNTIME]) {
    const result = spawn.sync("go", ["get", dep], {
      cwd: config.path("functions"),
      stdio: "inherit",
    });
    if (result.error) {
      logger.debug("Full output from go get command:", JSON.stringify(result, null, 2));
      throw new FirebaseError("Error installing dependencies", { children: [result.error] });
    }
  }
  utils.logSuccess("Installed dependencies");
}

module.exports = init;
