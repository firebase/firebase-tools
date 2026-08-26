import { Command } from "../command";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { Options } from "../options";
import {
  DEFAULT_TEMPLATE,
  installKitOrInstance,
  TEMPLATES,
  TemplateType,
} from "../functions/kits/install";

export interface FunctionsKitsInstallOptions extends Options {
  package?: string;
  directory?: string;
  template?: string;
}

export const command = new Command("functions:kits:install")
  .description("install a function kit into your project")
  .option("--package <package>", "NPM package name or specifier to install as a function kit")
  .option(
    "--directory <directory>",
    "path to a local functions codebase directory to install as a function kit",
  )
  .option(
    `--template [${Object.keys(TEMPLATES).join("|")}]`,
    "template to use for the kit index file",
    DEFAULT_TEMPLATE,
  )
  .action(async (options: FunctionsKitsInstallOptions): Promise<void> => {
    experiments.assertEnabled("kits", "install a function kit");

    if (!options.config) {
      throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
    }

    if (options.package && options.directory) {
      throw new FirebaseError("Cannot specify both --package and --directory. Please choose one.");
    }
    if (!options.package && !options.directory) {
      throw new FirebaseError("Must specify either --package or --directory.");
    }

    await installKitOrInstance({
      config: options.config,
      package: options.package,
      directory: options.directory,
      template: options.template as TemplateType,
      nonInteractive: options.nonInteractive,
      project: options.project,
      projectId: options.projectId,
      rc: options.rc,
    });
  });
