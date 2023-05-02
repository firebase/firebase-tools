import { Command } from "../command";
import { linkGitHubRepository } from "../init/features/turtles/repo";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";

export const command = new Command("internaltesting:turtles:init")
  .description("connect github repo to cloud build")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await linkGitHubRepository(projectId, "us-central1");
    // TODO: send repo metadata to turtles control plane
  });
