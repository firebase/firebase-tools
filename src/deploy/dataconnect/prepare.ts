import * as path from "path";

import { Options } from "../../options";
import { load } from "../../dataconnect/load";
import { readFirebaseJson } from "../../dataconnect/fileUtils";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { needProjectId } from "../../projectUtils";
import { getResourceFilters } from "../../dataconnect/filters";
import { build } from "../../dataconnect/build";
import { ensureApis } from "../../dataconnect/ensureApis";
import { requireTosAcceptance } from "../../requireTosAcceptance";
import { DATA_CONNECT_TOS_ID } from "../../gcp/firedata";

/**
 * Prepares for a Firebase DataConnect deployment by loading schemas and connectors from file.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  await ensureApis(projectId);
  await requireTosAcceptance(DATA_CONNECT_TOS_ID)(options);
  const serviceCfgs = readFirebaseJson(options.config);
  utils.logLabeledBullet("dataconnect", `Preparing to deploy`);
  const filters = getResourceFilters(options);
  const serviceInfos = await Promise.all(
    serviceCfgs.map((c) =>
      load(projectId, c.location, path.join(options.cwd || process.cwd(), c.source)),
    ),
  );
  for (const si of serviceInfos) {
    si.deploymentMetadata = await build(options, si.sourceDirectory);
  }
  context.dataconnect = {
    serviceInfos,
    filters,
  };
  utils.logLabeledBullet("dataconnect", `Successfully prepared schema and connectors`);
  logger.debug(JSON.stringify(context.dataconnect, null, 2));
  return;
}
