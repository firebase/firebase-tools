import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as spawn from "cross-spawn";
import * as stream from "stream";
import * as unzipper from "unzipper";
import fetch from "node-fetch"

import { FirebaseError } from "../../../error";
import { Config } from "../../../config";
import { promptOnce } from "../../../prompt";
import * as utils from "../../../utils";
import { logger } from "../../../logger";

const clc = require("cli-color");

const ADMIN_SDK = "firebase.google.com/go/v4";
const RUNTIME_VERSION = "1.13";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/golang");
const MAIN_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "functions.go"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");
const SDK_DROP = "https://storage.googleapis.com/firebase-preview-drop/go/functions/latest.zip";
const SDK_PATH = "github.com/FirebaseExtended/firebase-functions-go";

async function init(setup: unknown, config: Config) {
  await writeModFile(config);
  await config.askWriteProjectFile("functions/functions.go", MAIN_TEMPLATE);
  await config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
  utils.logLabeledBullet("functions",
    "Welcome to the preview version of the Firebase Functions Go SDK. " +
    "Please be a respectful member of the community and keep this a secret. " +
    "Until the GitHub repo is public, we have set up a vendored module for you. " + 
    "To update to the latest preview of the SDK, download " + SDK_DROP +
    " and extract its contents into your " + clc.bold("firebase-functions-go") +
    " directory");
}

// writeModFile is meant to look like askWriteProjectFile but it generates the contents
// dynamically using the go tool
async function writeModFile(config: Config) {
  const modPath = config.path("functions/go.mod");
  if (fs.existsSync(modPath)) {
    const shoudlWriteModFile = await promptOnce({
      type: "confirm",
      message: "File " + clc.underline("functions/go.mod") + " already exists. Overwrite?",
      default: false,
    });
    if (!shoudlWriteModFile) {
      return;
    }

    // Go will refuse to overwrite an existing mod file.
    fs.unlinkSync(modPath);
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
    "module " + modName + "\n\ngo " + RUNTIME_VERSION + "\n\n" +
    "require " + SDK_PATH + " v0.0.0\n\n" + "replace " + SDK_PATH + " => ./firebase-functions-go\n"
  );

  const download = await fetch(SDK_DROP);
  const pipeAsync = promisify(stream.pipeline);
  if (!download.body) {
    logger.debug("Unexpected empty body response when downloading firebase-functions-go SDK");
    throw new FirebaseError("Failed to download firebase-functions-go SDK");
  }
  if (!download.ok) {
    throw new FirebaseError("Faield to download firebase-functions-go SDK");
  }
  // for some reason, a ReadableStream<T> isn't a ReadableStream according to TS. This is
  // what the docs do though.
  await pipeAsync(download.body as any, unzipper.Extract({path: config.path("functions/firebase-functions-go")}));


  // Should this come later as "would you like to install dependencies" to mirror Node?
  // It's less clearly distinct from node where you can edit the package.json file w/o installing.
  // Here we're actually locking in a version in go.mod _and_ installing it in one step.
  const result = spawn.sync("go", ["get", ADMIN_SDK], {
    cwd: config.path("functions"),
    stdio: "inherit",
  });
  if (result.error) {
    logger.debug("Full output from go get command:", JSON.stringify(result, null, 2));
    throw new FirebaseError("Error installing dependencies", { children: [result.error] });
  }
  utils.logSuccess("Wrote " + clc.bold("functions/go.mod"));
}

module.exports = init;
