"use strict";

import * as fs from "fs";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";
import { createEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";

const rcGet  = require ("../../remoteconfig/get");
const getProjectId = require("../../getProjectId");
const _load = require("../../config");

module.exports = async function(context: any, options: any): Promise<void> {
  if (!context.remoteconfig) {
    return Promise.resolve();
  }
  if (!options){
    console.error(new Error().stack)
  }
  if (options.force) {
    return Promise.resolve();
  }
  var filePath = options.config.get("remoteconfig.template");
  const templateString = fs.readFileSync(filePath, 'utf8');
  const template = JSON.parse(templateString);
  const projectId = getProjectId(options);
  template.etag = await createEtag(projectId);
  validateInputRemoteConfigTemplate(template);
  return Promise.resolve();
}
