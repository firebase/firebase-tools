import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import requireInteractive from "../requireInteractive.js";
import { createGitRepoLink } from "../apphosting/backend.js";
import { ensureApiEnabled } from "../gcp/apphosting.js";
import { APPHOSTING_TOS_ID } from "../gcp/firedata.js";
import { requireTosAcceptance } from "../requireTosAcceptance.js";

export const command = new Command("apphosting:repos:create")
  .description("create a Firebase App Hosting Developer Connect Git Repository Link")
  .option("-l, --location <location>", "specify the location of the backend", "")
  .option("-g, --gitconnection <connection>", "id of the connection", "")
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location;
    const connection = options.gitconnection;

    await createGitRepoLink(projectId, location as string | null, connection as string | undefined);
  });
