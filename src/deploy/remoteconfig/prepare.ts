"use strict";

import * as fs from "fs";

import getProjectNumber = require("../../getProjectNumber");
import { getEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";

module.exports = async function(context: any, options: any): Promise<void> {
  if (!context) {
    return Promise.resolve();
  }
  if (!options) {
    console.error(new Error().stack);
  }
  const filePath = options.config.get("remoteconfig.template");
  const templateString = fs.readFileSync(filePath, "utf8");
  const template = JSON.parse(templateString);
  const projectNumber = await getProjectNumber(options);
  template.etag = await getEtag(projectNumber);
  validateInputRemoteConfigTemplate(template);
  context.template = template;
  return Promise.resolve();
};
