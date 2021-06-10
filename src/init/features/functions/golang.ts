import * as fs from "fs";
import * as path from "path";
import * as spawn from "cross-spawn";
import { promisify } from "util";

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
  await config.askWriteProjectFile("functions/functions.go", MAIN_TEMPLATE);
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
  // Manually create a go mod file because (A) it's easier this way and (B) it seems to be the only
  // way to set the min Go version to anything but what the user has installed.
  config.writeProjectFile(
    "functions/go.mod",
    "module " + modName + "\n\ngo " + RUNTIME_VERSION + "\n"
  );

  // Should this come later as "would you like to install dependencies" to mirror Node?
  // It's less clearly distinct from node where you can edit the package.json file w/o installing.
  // Here we're actually locking in a version in go.mod _and_ installing it in one step.
  const installDeps = await promptOnce({
    type: "confirm",
    message: "Would you like to install recommended dependencies?",
  });
  if (installDeps) {
    for (const dep of [
      go.ADMIN_SDK,
      go.FUNCTIONS_SDK,
      go.FUNCTIONS_CODEGEN,
      go.FUNCTIONS_SDK + "/support/emulator",
    ]) {
      const result = spawn.sync("go", ["get", dep], {
        cwd: config.path("functions"),
        stdio: "inherit",
      });
      if (result.error) {
        logger.debug(`Full output from \`go get ${dep}\`: ${JSON.stringify(result, null, 2)}`);
        throw new FirebaseError("Error installing dependencies", { children: [result.error] });
      }
    }
  }
  utils.logSuccess("Wrote " + clc.bold("functions/go.mod"));
}

module.exports = init;
