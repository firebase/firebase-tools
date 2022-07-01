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

import * as clc from "cli-color";

import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { deleteAppAndroidSha } from "../management/apps";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner } from "../utils";

export const command = new Command("apps:android:sha:delete <appId> <shaId>")
  .description("delete a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(async (appId: string = "", shaId: string = "", options: any): Promise<void> => {
    const projectId = needProjectId(options);

    await promiseWithSpinner<void>(
      async () => await deleteAppAndroidSha(projectId, appId, shaId),
      `Deleting Android SHA certificate hash with SHA id ${clc.bold(
        shaId
      )} and Android app Id ${clc.bold(appId)}`
    );
  });
