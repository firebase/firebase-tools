import { Command } from "../command";
const Table = require("cli-table");
import * as experiments from "../experiments";
import { partition } from "../functional";
import { logger } from "../logger";

export const command = new Command("experiments:list")
  .description(
    "list all experiments, along with a description of each experiment and whether it is currently enabled",
  )
  .action(() => {
    const table = new Table({
      head: ["Enabled", "Name", "Description"],
      style: { head: ["yellow"] },
    });
    const [enabled, disabled] = partition(Object.entries(experiments.ALL_EXPERIMENTS), ([name]) => {
      return experiments.isEnabled(name as experiments.ExperimentName);
    });
    for (const [name, exp] of enabled) {
      table.push(["y", name, exp.shortDescription]);
    }
    for (const [name, exp] of disabled) {
      if (!exp.public) {
        continue;
      }
      table.push(["n", name, exp.shortDescription]);
    }
    logger.info(table.toString());
  });
