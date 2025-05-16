import * as clc from "colorette";

import { FirebaseError } from "../../../error";
import * as api from "../../../firestore/api";
import * as fsutils from "../../../fsutils";
import { confirm, input } from "../../../prompt";
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

  if (fsutils.fileExistsSync(info.indexesFilename)) {
    const msg =
      "File " +
      clc.bold(info.indexesFilename) +
      " already exists." +
      " Do you want to overwrite it with the Firestore Indexes from the Firebase Console?";
    if (!(await confirm(msg))) {
      info.writeIndexes = false;
      return;
    }
  }

  if (setup.projectId) {
    info.indexes = await getIndexesFromConsole(setup.projectId, info.databaseId);
  }
}

async function getIndexesFromConsole(projectId: string, databaseId: string): Promise<string> {
  const indexesPromise = indexes.listIndexes(projectId, databaseId);
  const fieldOverridesPromise = indexes.listFieldOverrides(projectId, databaseId);

  try {
    const res = await Promise.all([indexesPromise, fieldOverridesPromise]);
    return JSON.stringify(indexes.makeIndexSpec(res[0], res[1]), null, 2);
  } catch (e: any) {
    if (e.message.indexOf("is not a Cloud Firestore enabled project") >= 0) {
      return INDEXES_TEMPLATE;
    }

    throw new FirebaseError("Error fetching Firestore indexes", {
      original: e,
    });
  }
}
