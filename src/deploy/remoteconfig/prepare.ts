import * as clc from "colorette";

import { needProjectNumber } from "../../projectUtils";
import { loadCJSON } from "../../loadCJSON";
import * as utils from "../../utils";
import { getEtag, publishTemplate } from "./functions";
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

  // Release never runs during --dry-run, and in a multi-target deploy other targets'
  // releases run before ours. Validate here so expression errors surface before any
  // target publishes (same as database's unconditional rules check).
  utils.logBullet(clc.bold(clc.cyan("remoteconfig: ")) + "validating template...");
  await publishTemplate(projectNumber, template, template.etag, {
    force: !!options.force,
    validateOnly: true,
  });
  utils.logSuccess(clc.bold(clc.green("remoteconfig: ")) + "template is valid");

  context.remoteconfigTemplate = template;
  return;
}
