import requireAccess = require("../../../requireAccess");
import * as rules from "./rules";
import * as indexes from "./indexes";

export async function doSetup(setup: any, config: any): Promise<any> {
  setup.config.firestore = {};

  await requireAccess.requireAccess({ project: setup.projectId });
  await rules.initRules(setup, config);
  await indexes.initIndexes(setup, config);
}
