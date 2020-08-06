"use strict";

import * as fs from "fs";
import { createEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";

const getProjectId = require("../../getProjectId");

module.exports = async function(context: any, options: any): Promise<void> {
  if (!context.remoteconfig) {
    return Promise.resolve();
  }
  if (!options) {
    console.error(new Error().stack);
  }
  if (options.force) {
    return Promise.resolve();
  }
  const filePath = options.config.get("remoteconfig.template");
  const templateString = fs.readFileSync(filePath, "utf8");
  const template = JSON.parse(templateString);
  const projectId = getProjectId(options);
  template.etag = await createEtag(projectId);
  validateInputRemoteConfigTemplate(template);
  return Promise.resolve();
};
