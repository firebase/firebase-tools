import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";
import { testRuleset, RulesTestSuite } from "../gcp/rules";
import * as fs from "fs-extra";

export const command = new Command("firestore:rules:test <rulesPath> <specPath>")
  .description("Run unit tests against your Firestore rules")
  .before(requirePermissions, ["datastore.databases.update"])
  // TODO: Should this support emulators?
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (rulesPath: string, specPath: string, options: FirestoreOptions) => {
    // const printer = new PrettyPrint();
    let rulesContents = await fs.readFile(rulesPath,  "utf8");
    const testSuite: RulesTestSuite = await fs.readJSON(specPath);
    let result = await testRuleset(options.project, [
      {
        name: "test.rules",
        content: rulesContents,
      },
    ], testSuite);

    logger.info(clc.bold(`${JSON.stringify(result, null, 2)}`));

    return result;
  });
