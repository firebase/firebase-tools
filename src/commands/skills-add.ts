import { Command } from "../command";
import { Options } from "../options";
import { installSkill } from "../skills/api";

export const command = new Command("skills:add <path> [transform_name]")
  .description("installs a skill, a skill pack, or ingests a local file, applying any requested transformations")
  .option("--global", "install to the global ~/.agent/skills directory")
  .option("--alias <name>", "rename the skill upon installation")
  .option("--set <key=value>", "apply AST/template mutations to the source code")
  .action(async (path: string, transformName: string | undefined, options: Options) => {
    const set: Record<string, string> = {};
    if (typeof options.set === "string") {
      const [key, value] = options.set.split("=");
      if (key && value) {
        set[key] = value;
      }
    }

    // If transformName is provided, we might want to handle it specifically.
    // For now, let's just pass it as part of transformations if we want.
    if (transformName) {
      set.transformName = transformName;
    }

    await installSkill(path, path, { ...options, set } as any);
  });
