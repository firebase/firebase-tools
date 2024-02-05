import * as _ from "lodash";
import * as clc from "colorette";
import * as fs from "fs";

import { fetchWebSetup, getCachedWebSetup } from "../fetchWebSetup";
import * as utils from "../utils";
import { logger } from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { EMULATORS_SUPPORTED_BY_USE_EMULATOR, Emulators } from "../emulator/types";

const INIT_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/hosting/init.js", "utf8");

export interface TemplateServerResponse {
  // __init.js content with only initializeApp()
  js: string;

  // __init.js content with initializeApp() and useEmulator() calls
  emulatorsJs: string;

  // firebaseConfig JSON
  json?: string;
}

/**
 * Generate template server response.
 * @param options the Firebase CLI options object.
 * @return Initialized server response by template.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function implicitInit(options: any): Promise<TemplateServerResponse> {
  let config;
  try {
    config = await fetchWebSetup(options);
  } catch (e: any) {
    logger.debug("fetchWebSetup error: " + e);
    const statusCode = _.get(e, "context.response.statusCode");
    if (statusCode === 403) {
      utils.logLabeledWarning(
        "hosting",
        `Authentication error when trying to fetch your current web app configuration, have you run ${clc.bold(
          "firebase login",
        )}?`,
      );
    }
  }

  if (!config) {
    config = getCachedWebSetup(options);
    if (config) {
      utils.logLabeledWarning("hosting", "Using web app configuration from cache.");
    }
  }

  if (!config) {
    config = undefined;
    utils.logLabeledWarning(
      "hosting",
      "Could not fetch web app configuration and there is no cached configuration on this machine. " +
        "Check your internet connection and make sure you are authenticated. " +
        "To continue, you must call firebase.initializeApp({...}) in your code before using Firebase.",
    );
  }

  const configJson = JSON.stringify(config, null, 2);

  const emulators: { [e in Emulators]?: { host: string; port: number; hostAndPort: string } } = {};
  for (const e of EMULATORS_SUPPORTED_BY_USE_EMULATOR) {
    const info = EmulatorRegistry.getInfo(e);

    if (info) {
      emulators[e] = {
        host: info.host,
        port: info.port,
        hostAndPort: EmulatorRegistry.url(e).host,
      };
    }
  }
  const emulatorsJson = JSON.stringify(emulators, null, 2);

  const js = INIT_TEMPLATE.replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`).replace(
    "/*--EMULATORS--*/",
    "var firebaseEmulators = undefined;",
  );
  const emulatorsJs = INIT_TEMPLATE.replace(
    "/*--CONFIG--*/",
    `var firebaseConfig = ${configJson};`,
  ).replace("/*--EMULATORS--*/", `var firebaseEmulators = ${emulatorsJson};`);
  return {
    js,
    emulatorsJs,
    json: configJson,
  };
}
