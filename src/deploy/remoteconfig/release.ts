import { publishTemplate, getEtag } from "./functions";
import { needProjectNumber } from "../../projectUtils";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

interface ReleaseContext {
  remoteconfigTemplate?: RemoteConfigTemplate;
  remoteconfigTemplateType?: string;
}

export default async function (context: ReleaseContext, options: any) {
  if (!context?.remoteconfigTemplate) {
    return;
  }
  const template = context.remoteconfigTemplate;
  const templateType = context.remoteconfigTemplateType;
  const projectNumber = await needProjectNumber(options);
  const etag = await getEtag(projectNumber, undefined, templateType);
  return publishTemplate(projectNumber, template, etag, { ...options, templateType });
}
