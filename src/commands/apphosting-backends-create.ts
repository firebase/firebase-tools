import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import requireInteractive from "../requireInteractive";
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
  .option("--backend <backend>", "specify the name of the new backend. Required with --force.")
  .option(
    "-s, --service-account <serviceAccount>",
    "specify the service account used to run the server",
    "",
  )
  .option(
    "--primary-region <primaryRegion>",
    "specify the primary region for the backend. Required with --force.",
  )
  .option("--root-dir <rootDir>", "specify the root directory for the backend. Defaults to `/`.")
  .option("-f, --force", "skip confirmations and connecting to a github repo.")
  .before(requireAuth)
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (options.force && (options.backend == null || options.primaryRegion == null)) {
      throw new FirebaseError(
        `--force option requires --backend, --primary-region, and --root-dir`,
      );
    }

    await doSetup(
      projectId,
      options.force,
      options.app as string | null,
      options.backend as string | null,
      options.serviceAccount as string | null,
      options.primaryRegion as string | null,
      options.rootDir as string | undefined,
    );
  });
