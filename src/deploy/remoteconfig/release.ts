import { publishTemplate, getEtag } from "./functions.js";
import { needProjectNumber } from "../../projectUtils.js";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces.js";

interface ReleaseContext {
  remoteconfigTemplate?: RemoteConfigTemplate;
}

export default async function (context: ReleaseContext, options: any) {
  if (!context?.remoteconfigTemplate) {
    return;
  }
  const template = context.remoteconfigTemplate;
  const projectNumber = await needProjectNumber(options);
  const etag = await getEtag(projectNumber);
  return publishTemplate(projectNumber, template, etag, options);
}
