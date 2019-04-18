import clc = require("cli-color");
import fs = require("fs");

import FirebaseError = require("../../error");
import gcp = require("../../gcp");
import iv2 = require("../../firestore/indexes");
import fsutils = require("../../fsutils");
import prompt = require("../../prompt");
import logger = require("../../logger");
import utils = require("../../utils");
import requireAccess = require("../../requireAccess");
import scopes = require("../../scopes");

const indexes = new iv2.FirestoreIndexes();

const RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/firestore/firestore.rules",
  "utf8"
);

const DEFAULT_RULES_FILE = "firestore.rules";

const INDEXES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/firestore/firestore.indexes.json",
  "utf8"
);

async function initRules(setup: any, config: any): Promise<any> {
  logger.info();
  logger.info("Firestore Security Rules allow you to define how and when to allow");
  logger.info("requests. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: "input",
      name: "rules",
      message: "What file should be used for Firestore Rules?",
      default: DEFAULT_RULES_FILE,
    },
  ])
    .then(() => {
      const filename = setup.config.firestore.rules;

      if (fsutils.fileExistsSync(filename)) {
        const msg =
          "File " +
          clc.bold(filename) +
          " already exists." +
          " Do you want to overwrite it with the Firestore Rules from the Firebase Console?";
        return prompt.once({
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

      return getRulesFromConsole(setup.projectId).then((contents: any) => {
        return config.writeProjectFile(setup.config.firestore.rules, contents);
      });
    });
}

async function getRulesFromConsole(projectId: string): Promise<any> {
  return gcp.rules
    .getLatestRulesetName(projectId, "cloud.firestore")
    .then((name) => {
      if (!name) {
        logger.debug("No rulesets found, using default.");
        return [{ name: DEFAULT_RULES_FILE, content: RULES_TEMPLATE }];
      }

      logger.debug("Found ruleset: " + name);
      return gcp.rules.getRulesetContent(name);
    })
    .then((rules: any[]) => {
      if (rules.length <= 0) {
        return utils.reject("Ruleset has no files", { exit: 1 });
      }

      if (rules.length > 1) {
        return utils.reject("Ruleset has too many files: " + rules.length, { exit: 1 });
      }

      // Even though the rules API allows for multi-file rulesets, right
      // now both the console and the CLI are built on the single-file
      // assumption.
      return rules[0].content;
    });
}

async function initIndexes(setup: any, config: any): Promise<any> {
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
        return prompt.once({
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

      return getIndexesFromConsole(setup.projectId).then((contents: any) => {
        return config.writeProjectFile(setup.config.firestore.indexes, contents);
      });
    });
}

async function getIndexesFromConsole(projectId: any): Promise<any> {
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

export async function doSetup(setup: any, config: any): Promise<any> {
  setup.config.firestore = {};

  return requireAccess({ project: setup.projectId })
    .then(() => {
      return initRules(setup, config);
    })
    .then(() => {
      return initIndexes(setup, config);
    });
}
