import api = require("../../api");
import { FirebaseError } from "../../error";
import { createEtag } from "./functions";
import { validateInputRemoteConfigTemplate, publishTemplate} from "./functions";
import getProjectNumber = require("../../getProjectNumber");
import logger = require("../../logger");
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";


module.exports = async function(context: any, options: any) {
  if (!context || !context.template) {
    return Promise.resolve();
  }
  const template = context.template;
  const projectNumber = await getProjectNumber(options);
  return publishTemplate(projectNumber, template, options);
};
