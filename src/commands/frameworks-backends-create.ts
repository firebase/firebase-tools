import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../init/features/frameworks";
import { ensureApiEnabled } from "../gcp/frameworks";

export const command = new Command("backends:create")
  .description("Create a backend in a Firebase project")
  .before(ensureApiEnabled)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await doSetup(options, projectId);
  });
