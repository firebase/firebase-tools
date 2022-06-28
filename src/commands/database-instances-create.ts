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

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";
import {
  createInstance,
  DatabaseInstanceType,
  DatabaseLocation,
  parseDatabaseLocation,
} from "../management/database";
import { needProjectId } from "../projectUtils";
import { getDefaultDatabaseInstance } from "../getDefaultDatabaseInstance";
import { FirebaseError } from "../error";
import { MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE } from "../requireDatabaseInstance";

export const command = new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  )
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (instanceName: string, options: any) => {
    const projectId = needProjectId(options);
    const defaultDatabaseInstance = await getDefaultDatabaseInstance({ project: projectId });
    if (defaultDatabaseInstance === "") {
      throw new FirebaseError(MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE);
    }
    const location = parseDatabaseLocation(options.location, DatabaseLocation.US_CENTRAL1);
    const instance = await createInstance(
      projectId,
      instanceName,
      location,
      DatabaseInstanceType.USER_DATABASE
    );
    logger.info(`created database instance ${instance.name}`);
    return instance;
  });
