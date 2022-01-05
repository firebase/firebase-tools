import { bold, yellow } from "cli-color";

import { logLabeledSuccess } from "../utils";
import { Command } from "../command";
import { Domain, createDomain } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";

const LOG_TAG = "hosting:domains";

export default new Command("hosting:domains:create [siteId] [domainName]")
  .description("create a Firebase Hosting domains")
  .before(requirePermissions, ["firebase.domains.create"])
  .action(
    async (
      siteId: string,
      domainName: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Domain> => {
      const projectId = needProjectId(options);
      if (!siteId) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"siteId" argument must be provided in a non-interactive environment`
          );
        }
        siteId = await promptOnce(
          {
            type: "input",
            message: "Please provide an unique, URL-friendly id for the site (<id>.web.app):",
            validate: (s) => s.length > 0,
          } // Prevents an empty string from being submitted!
        );
      }
      if (!siteId) {
        throw new FirebaseError(`"siteId" must not be empty`);
      }
      if (!domainName) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"domainName" argument must be provided in a non-interactive environment`
          );
        }
        domainName = await promptOnce(
          {
            type: "input",
            message: "Please provide an unique domainName (www.site.com):",
            validate: (s) => s.length > 0,
          } // Prevents an empty string from being submitted!
        );
      }
      if (!domainName) {
        throw new FirebaseError(`"domainName" must not be empty`);
      }

      let domain: Domain;
      try {
        domain = await createDomain(projectId, siteId, domainName);
      } catch (e) {
        if (e.status === 400) {
          throw new FirebaseError(
            `Domain ${bold(domainName)} must be added to ${bold(
              projectId
            )} using the Firebase Console.`,
            { original: e }
          );
        }
        throw e;
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Domain ${bold(domainName)} has been added to site ${bold(siteId)} in project ${bold(
          projectId
        )}.`
      );
      logLabeledSuccess(LOG_TAG, `Domain URL: ${domain.domainName}`);
      logger.info();
      return domain;
    }
  );
