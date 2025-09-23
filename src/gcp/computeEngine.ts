import { logger } from "../logger";
import { computeOrigin } from "../api";
import { Client } from "../apiv2";

const computeClient = () => new Client({ urlPrefix: computeOrigin() });
const defaultServiceAccountCache: Record<string, string> = {};
/** Returns the default compute engine service agent */
export async function getDefaultServiceAccount(projectNumber: string): Promise<string> {
  if (defaultServiceAccountCache[projectNumber]) {
    return defaultServiceAccountCache[projectNumber];
  }
  try {
    const res = await computeClient().get<{ defaultServiceAccount: string }>(
      `compute/v1/projects/${projectNumber}`,
    );
    defaultServiceAccountCache[projectNumber] = res.body.defaultServiceAccount;
    return res.body.defaultServiceAccount;
  } catch (err: any) {
    const bestGuess = `${projectNumber}-compute@developer.gserviceaccount.com`;
    logger.debug(
      `unable to look up default compute service account. Falling back to ${bestGuess}. Error: ${JSON.stringify(err)}`,
    );
    return bestGuess;
  }
}
