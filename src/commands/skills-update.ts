import { Command } from "../command";
import { Options } from "../options";
import { updateSkills } from "../skills/api";

export const command = new Command("skills:update [path]")
  .description("synchronizes the local workspace with the upstream registry, handling updates, renames, and user conflicts intelligently")
  .option("--global", "update skills in the global ~/.agent/skills directory")
  .action(async (path: string | undefined, options: Options) => {
    // RFC says: "Running update from the local directory provides the option to update global or local."
    // If [path] is provided, maybe we only update that specific skill? 
    // For now, let's implement the general update.
    await updateSkills(options as any);
  });
