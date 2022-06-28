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

import Table = require("cli-table");

import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { listAppAndroidSha, AppAndroidShaData } from "../management/apps";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";

function logCertificatesList(certificates: AppAndroidShaData[]): void {
  if (certificates.length === 0) {
    logger.info("No SHA certificate hashes found.");
    return;
  }
  const tableHead = ["App Id", "SHA Id", "SHA Hash", "SHA Hash Type"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  certificates.forEach(({ name, shaHash, certType }) => {
    /* the name property has the following value 
    "projects/projectId/androidApps/appId/sha/shaId" as it comes from the json response
    so we slpit the string in order to get appId and shaId. 
    Property shaId can be used by the end user to delete a SHA hash record.*/
    const splitted = name.split("/");
    const appId = splitted[3];
    const shaId = splitted[5];
    table.push([appId, shaId, shaHash, certType]);
  });

  logger.info(table.toString());
}

function logCertificatesCount(count: number = 0): void {
  if (count === 0) {
    return;
  }
  logger.info("");
  logger.info(`${count} SHA hash(es) total.`);
}

export const command = new Command("apps:android:sha:list <appId>")
  .description("list the SHA certificate hashes for a given app id. ")
  .before(requireAuth)
  .action(async (appId: string = "", options: any): Promise<AppAndroidShaData[]> => {
    const projectId = needProjectId(options);

    const shaCertificates = await promiseWithSpinner<AppAndroidShaData[]>(
      async () => await listAppAndroidSha(projectId, appId),
      "Preparing the list of your Firebase Android app SHA certificate hashes"
    );

    logCertificatesList(shaCertificates);
    logCertificatesCount(shaCertificates.length);
    return shaCertificates;
  });
