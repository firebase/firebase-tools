import { Command } from "../command";
import { Options } from "../options";
import { removeSkill } from "../skills/api";

export const command = new Command("skills:delete <name>")
  .description("removes a skill and ensures the file system and manifest stay synchronized")
  .option("--global", "remove from the global ~/.agent/skills directory")
  .action(async (name: string, options: Options) => {
    await removeSkill(name, options as any);
  });
