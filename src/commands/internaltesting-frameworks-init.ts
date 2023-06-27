import { Command } from "../command";
import { linkGitHubRepository } from "../init/features/composer/repo";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";

export const command = new Command("internaltesting:frameworks:init")
  .description("connect github repo to cloud build")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await linkGitHubRepository(projectId, "us-central2", "stack0");
    // TODO: send repo metadata to control plane
  });
