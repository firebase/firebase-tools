import { Command } from "../command";
import { readYAMLFile } from "../frameworks/compose/discover/index";
import requireInteractive from "../requireInteractive";

export const command = new Command("internaltesting:frameworks:init")
  .description("connect github repo to cloud build")
  .before(requireInteractive)
  .action(async () => {
    await readYAMLFile("test.yml");
    // TODO: send repo metadata to control plane
  });
