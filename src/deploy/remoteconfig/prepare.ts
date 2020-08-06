"use strict";

import * as fs from "fs";

import { createEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";

const getProjectNumber = require("../../getProjectNumber");

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
  template.etag = await createEtag(projectNumber);
  validateInputRemoteConfigTemplate(template);
  context.template = template;
  return Promise.resolve();
};
