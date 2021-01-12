import { publishTemplate, getEtag } from "./functions";
import { getProjectNumber } from "../../getProjectNumber";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

interface ReleaseContext {
  remoteconfigTemplate?: RemoteConfigTemplate;
}

export default async function (context: ReleaseContext, options: any) {
  if (!context?.remoteconfigTemplate) {
    return;
  }
  const template = context.remoteconfigTemplate;
  const projectNumber = await getProjectNumber(options);
  const etag = await getEtag(projectNumber);
  return publishTemplate(projectNumber, template, etag, options);
}
