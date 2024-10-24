import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { createGitRepoLink } from "../apphosting/backend";
import { ensureApiEnabled } from "../gcp/apphosting";
import { APPHOSTING_TOS_ID } from "../gcp/firedata";
import { requireTosAcceptance } from "../requireTosAcceptance";

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
