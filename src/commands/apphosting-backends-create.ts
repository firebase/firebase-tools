import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { doSetup } from "../apphosting/backend";
import { ensureApiEnabled } from "../gcp/apphosting";
import { APPHOSTING_TOS_ID } from "../gcp/firedata";
import { requireTosAcceptance } from "../requireTosAcceptance";

export const command = new Command("apphosting:backends:create")
  .description("create a Firebase App Hosting backend")
  .option(
    "-a, --app <webAppId>",
    "specify an existing Firebase web app's ID to associate your App Hosting backend with",
  )
  .option(
    "--backend <backend>",
    "specify the name of the new backend. Required with --non-interactive.",
  )
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .option(
    "--primary-region <primaryRegion>",
    "specify the primary region for the backend. Required with --non-interactive.",
  )
  .option("--root-dir <rootDir>", "specify the root directory for the backend.")
  .before((options: Options) => requireAuth(options))
  .before(ensureApiEnabled)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (options.nonInteractive && (options.backend == null || options.primaryRegion == null)) {
      throw new FirebaseError(`--non-interactive option requires --backend and --primary-region`);
    }

    await doSetup(
      projectId,
      options.nonInteractive,
      options.app as string | undefined,
      options.backend as string | undefined,
      options.serviceAccount as string | undefined,
      options.primaryRegion as string | undefined,
      options.rootDir as string | undefined,
    );
  });
