import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import requireInteractive from "../requireInteractive.js";
import { doSetup } from "../apphosting/backend.js";
import { ensureApiEnabled } from "../gcp/apphosting.js";
import { APPHOSTING_TOS_ID } from "../gcp/firedata.js";
import { requireTosAcceptance } from "../requireTosAcceptance.js";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webAppId>",
    "specify an existing Firebase web app's ID to associate your App Hosting backend with",
  )
  .option("-l, --location <location>", "specify the location of the backend", "")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const webAppId = options.app;
    const location = options.location;
    const serviceAccount = options.serviceAccount;

    await doSetup(
      projectId,
      webAppId as string | null,
      location as string | null,
      serviceAccount as string | null,
    );
  });
