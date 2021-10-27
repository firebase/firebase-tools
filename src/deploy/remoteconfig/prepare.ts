import { needProjectNumber } from "../../projectUtils";
import loadCJSON = require("../../loadCJSON");
import { getEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";
import { Options } from "../../options";

export default async function (context: any, options: Options): Promise<void> {
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
