import { publishTemplate, getEtag } from "./functions";
import getProjectNumber = require("../../getProjectNumber");
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

interface ReleaseContext {
  remoteconfigTemplate?: RemoteConfigTemplate;
}

module.exports = async function(context: ReleaseContext, options: any) {
  if (!context?.remoteconfigTemplate) {
    return;
  }
  const template = context.remoteconfigTemplate;
  const projectNumber = await getProjectNumber(options);
  const etag = await getEtag(projectNumber);
  return publishTemplate(projectNumber, template, etag, options);
};
