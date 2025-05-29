import * as clc from "colorette";

import { FirebaseError } from "../../../error";
import * as api from "../../../firestore/api";
import { input } from "../../../prompt";
import * as utils from "../../../utils";
import { logger } from "../../../logger";
import { readTemplateSync } from "../../../templates";
import { RequiredInfo } from ".";
import { Setup } from "../..";
import { Config } from "../../../config";

const indexes = new api.FirestoreApi();

export const DEFAULT_INDEXES_FILE = "firestore.indexes.json";
export const INDEXES_TEMPLATE = readTemplateSync("init/firestore/firestore.indexes.json");

export async function initIndexes(setup: Setup, config: Config, info: RequiredInfo): Promise<any> {
  logger.info();
  logger.info("Firestore indexes allow you to perform complex queries while");
  logger.info("maintaining performance that scales with the size of the result");
  logger.info("set. You can keep index definitions in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  info.indexesFilename =
    info.indexesFilename ||
    (await input({
      message: "What file should be used for Firestore indexes?",
      default: DEFAULT_INDEXES_FILE,
    }));

  info.indexes = INDEXES_TEMPLATE;
  if (setup.projectId) {
    const downloadIndexes = await getIndexesFromConsole(setup.projectId, info.databaseId);
    if (downloadIndexes) {
      info.indexes = downloadIndexes;
      utils.logBullet(`Downloaded the existing Firestore indexes from the Firebase console`);
    }
  }

  info.writeRules = await config.confirmWriteProjectFile(info.indexesFilename, info.indexes);
}

async function getIndexesFromConsole(
  projectId: string,
  databaseId: string,
): Promise<string | null> {
  const indexesPromise = indexes.listIndexes(projectId, databaseId);
  const fieldOverridesPromise = indexes.listFieldOverrides(projectId, databaseId);

  try {
    const res = await Promise.all([indexesPromise, fieldOverridesPromise]);
    return JSON.stringify(indexes.makeIndexSpec(res[0], res[1]), null, 2);
  } catch (e: any) {
    if (e.status === 404) {
      return null; // Database is not found
    }
    if (e.message.indexOf("is not a Cloud Firestore enabled project") >= 0) {
      return null;
    }

    throw new FirebaseError("Error fetching Firestore indexes", {
      original: e,
    });
  }
}
