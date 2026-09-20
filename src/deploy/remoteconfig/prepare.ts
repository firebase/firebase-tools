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

  // The release phase (the only place a real deploy's template PUT happens) never runs
  // during --dry-run, and is not the only target running before release in a multi-target
  // deploy. Validate against the Remote Config API here, in prepare, so condition expression
  // syntax errors are caught before any target's release runs, matching the unconditional
  // validation database's prepare phase performs for realtime database rules.
  utils.logBullet(clc.bold(clc.cyan("remoteconfig: ")) + "validating template...");
  await publishTemplate(projectNumber, template, template.etag, { validateOnly: true });
  utils.logSuccess(clc.bold(clc.green("remoteconfig: ")) + "template is valid");

  context.remoteconfigTemplate = template;
  return;
}
