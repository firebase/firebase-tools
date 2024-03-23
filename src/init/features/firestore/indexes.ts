import * as clc from "colorette";
import * as fs from "fs";

import { FirebaseError } from "../../../error";
import * as api from "../../../firestore/api";
import * as fsutils from "../../../fsutils";
import { prompt, promptOnce } from "../../../prompt";
import { logger } from "../../../logger";

const indexes = new api.FirestoreApi();

const INDEXES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/firestore/firestore.indexes.json",
  "utf8",
);

export function initIndexes(setup: any, config: any): Promise<any> {
  logger.info();
  logger.info("Firestore indexes allow you to perform complex queries while");
  logger.info("maintaining performance that scales with the size of the result");
  logger.info("set. You can keep index definitions in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: "input",
      name: "indexes",
      message: "What file should be used for Firestore indexes?",
      default: "firestore.indexes.json",
    },
  ])
    .then(() => {
      const filename = setup.config.firestore.indexes;
      if (fsutils.fileExistsSync(filename)) {
        const msg =
          "File " +
          clc.bold(filename) +
          " already exists." +
          " Do you want to overwrite it with the Firestore Indexes from the Firebase Console?";
        return promptOnce({
          type: "confirm",
          message: msg,
          default: false,
        });
      }
      return Promise.resolve(true);
    })
    .then((overwrite) => {
      if (!overwrite) {
        return Promise.resolve();
      }

      if (!setup.projectId) {
        return config.writeProjectFile(setup.config.firestore.indexes, INDEXES_TEMPLATE);
      }

      return getIndexesFromConsole(setup.projectId).then((contents: any) => {
        return config.writeProjectFile(setup.config.firestore.indexes, contents);
      });
    });
}

function getIndexesFromConsole(projectId: any): Promise<any> {
  const indexesPromise = indexes.listIndexes(projectId);
  const fieldOverridesPromise = indexes.listFieldOverrides(projectId);

  return Promise.all([indexesPromise, fieldOverridesPromise])
    .then((res) => {
      return indexes.makeIndexSpec(res[0], res[1]);
    })
    .catch((e) => {
      if (e.message.indexOf("is not a Cloud Firestore enabled project") >= 0) {
        return INDEXES_TEMPLATE;
      }

      throw new FirebaseError("Error fetching Firestore indexes", {
        original: e,
      });
    });
}
