import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { doSetup } from "../apphosting/backend";
import { ensureApiEnabled } from "../gcp/apphosting";
import * as experiments from "../experiments";
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
  .option("--root-dir <rootDir>", "specify the root directory for the backend.");
const abiuEnabled = experiments.isEnabled("abiu");
if (abiuEnabled) {
  command.option(
    "--runtime [runtime]",
    "specify the runtime for the backend (e.g., nodejs, nodejs22)",
  );
}

command
  .before(requireAuth)
  .before(ensureApiEnabled)
  .before(requireTosAcceptance(APPHOSTING_TOS_ID))
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (options.nonInteractive && (options.backend == null || options.primaryRegion == null)) {
      throw new FirebaseError(`--non-interactive option requires --backend and --primary-region`);
    }

    const abiuAllowed = experiments.isEnabled("abiu");
    if (!abiuAllowed && options.runtime) {
      throw new FirebaseError(
        "The --runtime flag is only available when the 'abiu' experiment is enabled. To enable it, run 'firebase experiments:enable abiu'.",
      );
    }
    // When ABIU is allowed but the user doesn't provide a runtime string, we let doSetup handle it.
    // We strictly check for string type to avoid boolean true (flag present without value) causing issues.
    const runtime =
      abiuAllowed && typeof options.runtime === "string" ? options.runtime : undefined;

    return doSetup(
      projectId,
      options.nonInteractive,
      options.app as string | undefined,
      options.backend as string | undefined,
      options.serviceAccount as string | undefined,
      options.primaryRegion as string | undefined,
      options.rootDir as string | undefined,
      runtime,
    );
  });
