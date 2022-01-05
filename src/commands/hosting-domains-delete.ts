import { bold, underline } from "cli-color";
import { Command } from "../command";
import { logLabeledSuccess } from "../utils";
import { getDomain, deleteDomain } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as requireConfig from "../requireConfig";
import { logger } from "../logger";

const LOG_TAG = "hosting:sites";

export default new Command("hosting:domains:delete <siteId> <domain>")
  .description("delete a Firebase Hosting domain")
  .withForce()
  .before(requireConfig)
  .before(requirePermissions, ["firebase.domains.create"])
  .action(
    async (
      siteId: string,
      domain: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = needProjectId(options);
      if (!siteId) {
        throw new FirebaseError("siteId is required");
      }
      logger.info(
        `Deleting a site is a permanent action. If you delete a site, Firebase doesn't maintain records of deployed files or deployment history, and the site ${underline(
          siteId
        )} cannot be reactivated by you or anyone else.`
      );
      logger.info();

      const confirmed = await promptOnce(
        {
          name: "force",
          type: "confirm",
          message: `Are you sure you want to delete the Hosting domain ${underline(
            domain
          )} on site ${underline(siteId)}, project ${underline(projectId)}? `,
          default: false,
        },
        options
      );
      if (!confirmed) {
        return;
      }

      // Check that the domain exists first, to avoid giving a sucessesful message on a non-existant site.
      await getDomain(projectId, siteId, domain);
      await deleteDomain(projectId, siteId, domain);
      logLabeledSuccess(
        LOG_TAG,
        `Successfully deleted domain ${bold(domain)} from site ${bold(siteId)}, project ${bold(
          projectId
        )}`
      );
    }
  );
