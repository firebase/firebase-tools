import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import { fetchWebSetup, getCachedWebSetup } from "../fetchWebSetup";
import * as utils from "../utils";
import * as logger from "../logger";

const INIT_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/hosting/init.js", "utf8");

export interface TemplateServerResponce {
  js: string | undefined;
  json: string | undefined;
}

/**
 * generate template server responce
 * @param options
 * @return {Promise<{js: string, json: string}>}
 */
export async function implicitInit(options: any): Promise<TemplateServerResponce> {
  let config;
  try {
    config = await fetchWebSetup(options);
  } catch (e) {
    logger.debug("fetchWebSetup error: " + e);
    const statusCode = _.get(e, "context.response.statusCode");
    if (statusCode === 403) {
      utils.logLabeledWarning(
        "hosting",
        `Authentication error when trying to fetch your current web app configuration, have you run ${clc.bold(
          "firebase login"
        )}?`
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
        "To continue, you must call firebase.initializeApp({...}) in your code before using Firebase."
    );
  }

  const configJson = JSON.stringify(config, null, 2);
  return {
    js: INIT_TEMPLATE.replace("/*--CONFIG--*/", `var firebaseConfig = ${configJson};`),
    json: configJson,
  };
}
