import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../apphosting/backend";
import { ensureApiEnabled } from "../gcp/apphosting";
import { APPHOSTING_TOS_ID } from "../gcp/firedata";
import { requireTosAcceptance } from "../requireTosAcceptance";
import { logWarning } from "../utils";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webAppId>",
    "specify an existing Firebase web app's ID to associate your App Hosting backend with",
  )
  .option("-l, --location <location>", "specify the location of the backend")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    if (options.location !== undefined) {
      logWarning(
        "--location is being removed in the next major release. " +
          "The CLI will prompt for a Primary Region where appropriate.",
      );
    }
    const projectId = needProjectId(options);
    const webAppId = options.app;
    const location = options.location as string;
    const serviceAccount = options.serviceAccount;

    await doSetup(
      projectId,
      webAppId as string | null,
      location as string | null,
      serviceAccount as string | null,
    );
  });
