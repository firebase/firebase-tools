import { needProjectNumber } from "../../projectUtils";
import { loadCJSON } from "../../loadCJSON";
import { getEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";
import { DeployOptions } from "../";

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
