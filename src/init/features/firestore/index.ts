import * as apiEnabled from "../../../ensureApiEnabled";
import { ensureLocationSet } from "../../../ensureCloudResourceLocation";
import { requirePermissions } from "../../../requirePermissions";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import * as clc from "cli-color";

export async function doSetup(setup: any, config: any): Promise<void> {
  const isFirestoreEnabled = await apiEnabled.check(
    setup.projectId,
    "firestore.googleapis.com",
    "",
    true
  );
  if (!isFirestoreEnabled) {
    throw new FirebaseError(
      `It looks like you haven't used Cloud Firestore in this project before. Go to ${clc.bold.underline(
        `https://console.firebase.google.com/project/${setup.projectId}/database`
      )} to create your Cloud Firestore database.`,
      { exit: 1 }
    );
  }

  setup.config.firestore = {};
  ensureLocationSet(setup.projectLocation, "Cloud Firestore");
  await requirePermissions({ project: setup.projectId });
  await rules.initRules(setup, config);
  await indexes.initIndexes(setup, config);
}
