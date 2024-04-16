import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../apphosting";
import { ensureApiEnabled } from "../gcp/apphosting";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webApp>",
    "specify an existing Firebase web app to associate your App Hosting backend with",
  )
  .option("-l, --location <location>", "specify the region of the backend", "")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .option(
    "-w, --with-dev-connect",
    "use the Developer Connect flow insetad of Cloud Build Repositories (testing)",
    false,
  )
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const webApp = options.app;
    const location = options.location;
    const serviceAccount = options.serviceAccount;
    const withDevConnect = options.withDevConnect as boolean;

    await doSetup(
      projectId,
      webApp as string | null,
      location as string | null,
      serviceAccount as string | null,
      withDevConnect,
    );
  });
