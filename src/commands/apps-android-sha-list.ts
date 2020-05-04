import * as clc from "cli-color";
import * as ora from "ora";
import Table = require("cli-table");

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { listAppAndroidSha, AppAndroidShaData } from "../management/apps";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";

function logCertificatesList(certificates: AppAndroidShaData[]): void {
  if (certificates.length === 0) {
    logger.info(clc.bold("No SHA certificate hashes found."));
    return;
  }
  const tableHead = ["App Id", "SHA Id", "SHA Hash", "SHA Hash Type"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  certificates.forEach(({ name, shaHash, certType }) => {
    const splitted = name.split("/");
    table.push([splitted[3], splitted[5], shaHash, certType]);
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

module.exports = new Command("apps:android:sha:list [appId]")
  .description("list the SHA certificate hashes for a given app id. ")
  .before(requireAuth)
  .action(
    async (appId: string = "", options: any): Promise<AppAndroidShaData[]> => {
      const projectId = getProjectId(options);

      let certificates;
      const spinner = ora("Preparing the list of your Firebase Android app SHA certificate hashes").start();
      try {
        certificates = await listAppAndroidSha(projectId, appId);
      } catch (err) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logCertificatesList(certificates);
      logCertificatesCount(certificates.length);
      return certificates;
    }
  );
