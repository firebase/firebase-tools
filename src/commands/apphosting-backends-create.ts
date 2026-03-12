import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { doSetup } from "../apphosting/backend";
import { ensureApiEnabled } from "../gcp/apphosting";
import { isEnabled } from "../experiments";
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
  .option("--runtime <runtime>", "specify the runtime for the backend (e.g., nodejs, nodejs22)")
  .option(
    "--[no-]automatic-base-image-updates",
    "specify whether or not you want automatic base image updates",
  )
  .before(requireAuth)
  .before(ensureApiEnabled)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (options.nonInteractive && (options.backend == null || options.primaryRegion == null)) {
      throw new FirebaseError(`--non-interactive option requires --backend and --primary-region`);
    }

    const abiuAllowed = isEnabled("abiu");
    if (!abiuAllowed && (options.runtime || options.automaticBaseImageUpdates !== undefined)) {
      throw new FirebaseError(
        "The --runtime and --automatic-base-image-updates flags are only available when the 'abiu' experiment is enabled. To enable it, run 'firebase experiments:enable abiu'.",
      );
    }
    const runtime = abiuAllowed ? (options.runtime as string | undefined) : undefined;
    const automaticBaseImageUpdatesDisabled =
      abiuAllowed && options.automaticBaseImageUpdates != null
        ? !options.automaticBaseImageUpdates
        : undefined;

    await doSetup(
      projectId,
      options.nonInteractive,
      options.app as string | undefined,
      options.backend as string | undefined,
      options.serviceAccount as string | undefined,
      options.primaryRegion as string | undefined,
      options.rootDir as string | undefined,
      runtime,
      automaticBaseImageUpdatesDisabled,
    );
  });
