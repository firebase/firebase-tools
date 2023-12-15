import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../init/features/apphosting";
import { ensureApiEnabled } from "../gcp/apphosting";

export const command = new Command("apphosting:backends:create")
  .description("Create a backend in a Firebase project")
  .option("-l, --location <location>", "Specify the region of the backend", "")
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await doSetup(options, projectId);
  });
