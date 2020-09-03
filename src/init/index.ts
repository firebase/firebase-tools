import * as _ from "lodash";
import * as clc from "cli-color";
import logger = require("../logger");
import * as _features from "./features";
import * as utils from "../utils";

export interface Indexable<T = any> {
  [key: string]: T;
}
export interface RCFile {
  projects: Indexable;
}
export interface Setup {
  config: Indexable;
  rcfile: RCFile;
  featureArg: boolean;
  features: string[];
  project: Indexable;
  projectId: string;
  projectLocation: string;
}

// TODO: Convert features/index.js to TypeScript so it exports
// as an indexable type instead of doing this cast.
const features = _features as Indexable;

export async function init(setup: Setup, config: any, options: any): Promise<any> {
  const nextFeature = setup.features.shift();
  if (nextFeature) {
    if (!features[nextFeature]) {
      return utils.reject(
        clc.bold(nextFeature) +
          " is not a valid feature. Must be one of " +
          _.without(_.keys(features), "project").join(", ")
      );
    }

    logger.info(clc.bold("\n" + clc.white("=== ") + _.capitalize(nextFeature) + " Setup"));

    await Promise.resolve(features[nextFeature](setup, config, options));
    return init(setup, config, options);
  }
}
