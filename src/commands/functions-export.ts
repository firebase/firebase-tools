import { Command } from "../command";
import { FirebaseError } from "../error";
import { getFunctionsManifest } from "../functions/iac/export";
import { requirePermissions } from "../requirePermissions";
import { normalizeAndValidate, configForCodebase } from "../functions/projectConfig";
import { needProjectId } from "../projectUtils";
import * as functionsConfig from "../functionsConfig";
import * as functionsEnv from "../functions/env";
import * as clc from "colorette";

export const command = new Command("functions:export")
  .description("export Cloud Functions code and configuration")
  .option("--format <format>", "Format of the output. Can be internal, terraform, or designcenter.")
  .option(
    "--codebase <codebase>",
    "Optional codebase to export. If not specified, exports the default or only codebase.",
  )
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: any) => {
    if (!options.format || !["internal", "terraform", "designcenter"].includes(options.format)) {
      throw new FirebaseError(
        "Must specify --format as 'internal', 'terraform', or 'designcenter'.",
      );
    }

    const projectId = needProjectId(options);
    const config = normalizeAndValidate(options.config?.src?.functions);
    let codebaseConfig;
    if (options.codebase) {
      codebaseConfig = configForCodebase(config, options.codebase);
    } else {
      if (config.length === 1) {
        codebaseConfig = config[0];
      } else {
        codebaseConfig = configForCodebase(config, "default");
      }
    }

    if (!codebaseConfig.source) {
      throw new FirebaseError("Codebase does not have a local source directory.");
    }

    const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
    const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);

    const manifest = await getFunctionsManifest(
      options.config.path(codebaseConfig.source),
      options.config.projectDir,
      projectId,
      codebaseConfig.runtime,
      firebaseEnvs,
      options.format,
    );

    for (const [file, contents] of Object.entries(manifest)) {
      console.log(`Manifest file: ${clc.bold(file)}`);
      console.log(contents);
    }
  });
