import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../apphosting";
import { ensureApiEnabled } from "../gcp/apphosting";
import { APPHOSTING_TOS_ID } from "../gcp/firedata";
import requireTosAcceptance from "../requireTosAcceptance";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webApp>",
    "specify an existing Firebase web app to associate your App Hosting backend with",
  )
  .option("-l, --location <location>", "specify the location of the backend", "")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .option(
    "-w, --with-cloud-build-repos",
    "use Cloud Build Repositories flow instead of the Developer Connect flow",
  )
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const webApp = options.app;
    const location = options.location;
    const serviceAccount = options.serviceAccount;
    const withCloudBuildRepos = options.withCloudBuildRepos as boolean;

    await doSetup(
      projectId,
      webApp as string | null,
      location as string | null,
      serviceAccount as string | null,
      withCloudBuildRepos,
    );
  });
