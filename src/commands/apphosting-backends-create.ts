import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../apphosting";
import { ensureApiEnabled } from "../gcp/apphosting";
import { APPHOSTING_TOS_ID } from "../gcp/firedata";
import { requireTosAcceptance } from "../requireTosAcceptance";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webAppId>",
    "specify an existing Firebase web app's ID to associate your App Hosting backend with",
  )
  .option("-l, --location <location>", "specify the location of the backend", "")
  .option("-b, --backendID <backend>", "provide a name for your backend [1-30 characters]", "")
  .option(
    "-r, --rootDir <root>",
    "specify your app's root directory relative to your repository",
    "",
  )
  .option("-b, --branch <branch>", "pick a branch for continuous deployment", "")
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
    const backend = options.backend;
    const root = options.root;
    const branch = options.branch;

    await doSetup(
      projectId,
      webAppId as string | null,
      location as string | null,
      serviceAccount as string | null,
      backend as string | null,
      root as string | null,
      branch as string | null,
    );
  });
