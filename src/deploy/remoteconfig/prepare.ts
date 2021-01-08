import { getProjectNumber } from "../../getProjectNumber";
import loadCJSON = require("../../loadCJSON");
import { getEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";

export default async function (context: any, options: any): Promise<void> {
  if (!context) {
    return;
  }
  const filePath = options.config.get("remoteconfig.template");
  if (!filePath) {
    return;
  }
  const template = loadCJSON(filePath);
  const projectNumber = await getProjectNumber(options);
  template.etag = await getEtag(projectNumber);
  validateInputRemoteConfigTemplate(template);
  context.remoteconfigTemplate = template;
  return;
}
