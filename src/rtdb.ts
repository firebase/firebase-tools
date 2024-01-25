import { Client } from "./apiv2";
import { DatabaseInstance, populateInstanceDetails } from "./management/database";
import { FirebaseError } from "./error";
import { realtimeOriginOrCustomUrl } from "./database/api";
import * as utils from "./utils";

/**
 * Updates rules, optionally specifying a dry run flag for validation purposes.
 */
export async function updateRules(
  projectId: string,
  instance: string,
  src: any,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const queryParams: { dryRun?: string } = {};
  if (options.dryRun) {
    queryParams.dryRun = "true";
  }
  const downstreamOptions: {
    instance: string;
    project: string;
    instanceDetails?: DatabaseInstance;
  } = { instance: instance, project: projectId };
  await populateInstanceDetails(downstreamOptions);
  if (!downstreamOptions.instanceDetails) {
    throw new FirebaseError(`Could not get instance details`, { exit: 2 });
  }
  const origin = utils.getDatabaseUrl(
    realtimeOriginOrCustomUrl(downstreamOptions.instanceDetails.databaseUrl),
    instance,
    "",
  );
  const client = new Client({ urlPrefix: origin });
  const response = await client.request<any, any>({
    method: "PUT",
    path: ".settings/rules.json",
    queryParams,
    body: src,
    resolveOnHTTPError: true,
  });
  if (response.status === 400) {
    throw new FirebaseError(`Syntax error in database rules:\n\n${response.body.error}`);
  } else if (response.status > 400) {
    throw new FirebaseError("Unexpected error while deploying database rules.", { exit: 2 });
  }
}
