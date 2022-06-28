/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { logger } from "../../../logger";
import * as apiEnabled from "../../../ensureApiEnabled";
import { ensureLocationSet } from "../../../ensureCloudResourceLocation";
import { requirePermissions } from "../../../requirePermissions";
import { checkDatabaseType } from "../../../firestore/checkDatabaseType";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import * as clc from "cli-color";

async function checkProjectSetup(setup: any, config: any, options: any) {
  const firestoreUnusedError = new FirebaseError(
    `It looks like you haven't used Cloud Firestore in this project before. Go to ${clc.bold.underline(
      `https://console.firebase.google.com/project/${setup.projectId}/firestore`
    )} to create your Cloud Firestore database.`,
    { exit: 1 }
  );

  // First check if the Firestore API is enabled. If it's not, then the developer needs
  // to go set up Firestore in the console.
  const isFirestoreEnabled = await apiEnabled.check(
    setup.projectId,
    "firestore.googleapis.com",
    "",
    true
  );
  if (!isFirestoreEnabled) {
    throw firestoreUnusedError;
  }

  // Next, use the AppEngine Apps API to check the database type.
  // This allows us to filter out projects that are not using Firestore in Native mode.
  const dbType = await checkDatabaseType(setup.projectId);
  logger.debug(`database_type: ${dbType}`);

  if (!dbType) {
    throw firestoreUnusedError;
  } else if (dbType !== "CLOUD_FIRESTORE") {
    throw new FirebaseError(
      `It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode. The Firebase CLI can only manage projects using Cloud Firestore in Native mode. For more information, visit https://cloud.google.com/datastore/docs/firestore-or-datastore`,
      { exit: 1 }
    );
  }

  ensureLocationSet(setup.projectLocation, "Cloud Firestore");
  await requirePermissions({ ...options, project: setup.projectId });
}

export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  if (setup.projectId) {
    await checkProjectSetup(setup, config, options);
  }

  setup.config.firestore = {};
  await rules.initRules(setup, config);
  await indexes.initIndexes(setup, config);
}
