import { needProjectNumber } from "../../projectUtils.js";
import { loadCJSON } from "../../loadCJSON.js";
import { getEtag } from "./functions.js";
import { validateInputRemoteConfigTemplate } from "./functions.js";
import { DeployOptions } from "../index.js";

export default async function (context: any, options: DeployOptions): Promise<void> {
  if (!context) {
    return;
  }
  const filePath = options.config.src.remoteconfig?.template;
  if (!filePath) {
    return;
  }
  const template = loadCJSON(filePath);
  const projectNumber = await needProjectNumber(options);
  template.etag = await getEtag(projectNumber);
  validateInputRemoteConfigTemplate(template);
  context.remoteconfigTemplate = template;
  return;
}
