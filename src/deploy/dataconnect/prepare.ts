import * as path from "path";

import { Options } from "../../options";
import { load } from "../../dataconnect/source";
import { readFirebaseJson } from "../../dataconnect/fileUtils";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { ensure } from "../../ensureApiEnabled";
import { needProjectId } from "../../projectUtils";
import { dataconnectOrigin } from "../../api";

/**
 * Prepares for a Firebase DataConnect deployment by loading schemas and connectors from file.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  await ensure(projectId, new URL(dataconnectOrigin).hostname, "dataconnect");
  const serviceCfgs = readFirebaseJson(options.config);
  utils.logLabeledBullet("dataconnect", `Preparing to deploy`);
  context.dataconnect = await Promise.all(
    serviceCfgs.map((c) => load(projectId, c.location, path.join(options.cwd || process.cwd(), c.source))),
  );

  utils.logLabeledBullet("dataconnect", `Successfully prepared schema and connectors`);
  logger.debug(JSON.stringify(context.dataconnect, null, 2));
  return;
}
