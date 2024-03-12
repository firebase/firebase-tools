import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../init/features/apphosting";
import { ensureApiEnabled } from "../gcp/apphosting";

export const command = new Command("apphosting:backends:create")
  .description("create a backend in a Firebase project")
  .option("-a, --app <webApp>", "specify the Firebase web app your backend will be associated with")
  .option("-l, --location <location>", "specify the region of the backend", "")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const webApp = options.app;
    const location = options.location;
    const serviceAccount = options.serviceAccount;

    await doSetup(
      projectId,
      webApp as string | null,
      location as string | null,
      serviceAccount as string | null,
    );
  });
