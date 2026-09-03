import { Command } from "../command";
import { FirebaseError } from "../error";
import * as iac from "../functions/iac/export";
import { normalizeAndValidate, configForCodebase } from "../functions/projectConfig";
import * as clc from "colorette";
import { logger } from "../logger";
import { mkdirsSync } from "fs-extra";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";

const EXPORTERS: Record<string, iac.Exporter> = {
  internal: iac.getInternalIac,
  terraform: iac.getTerraformIac,
};

export const command = new Command("functions:export")
  .description("export Cloud Functions code and configuration")
  .option("--format <format>", `Format of the output. Can be ${Object.keys(EXPORTERS).join(", ")}.`)
  .option(
    "--codebase <codebase>",
    "Optional codebase to export. If not specified, exports the default or only codebase.",
  )
  .option(
    "--out <out>",
    "Optional directory to output the files to. If not specified, prints to stdout.",
  )
  .action(async (options: any) => {
    if (!options.format || !Object.keys(EXPORTERS).includes(options.format)) {
      throw new FirebaseError(`Must specify --format as ${Object.keys(EXPORTERS).join(", ")}.`);
    }

    const config = normalizeAndValidate(options.config?.src?.functions);
    let codebaseConfig;
    if (options.codebase) {
      codebaseConfig = configForCodebase(config, options.codebase);
    } else if (config.length === 1) {
      codebaseConfig = config[0];
    } else {
      codebaseConfig = configForCodebase(config, "default");
    }

    if (!codebaseConfig.source) {
      throw new FirebaseError("Codebase does not have a local source directory.");
    }

    const manifest = await EXPORTERS[options.format](options, codebaseConfig);

    if (!options.out) {
      for (const [file, contents] of Object.entries(manifest)) {
        logger.info(`Manifest file: ${clc.bold(file)}`);
        logger.info(contents);
      }
    } else {
      mkdirsSync(options.out);
      await Promise.all(
        Object.entries(manifest).map(([file, contents]) => {
          logger.info(`Writing manifest file: ${clc.bold(path.join(options.out, file))}`);
          return writeFile(path.join(options.out, file), contents);
        }),
      );
    }
  });
