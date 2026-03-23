import * as spawn from "cross-spawn";
import { Config } from "../../../config";
import { confirm } from "../../../prompt";
import { latest } from "../../../deploy/functions/runtimes/supported";
import { readTemplateSync } from "../../../templates";

const PUBSPEC_TEMPLATE = readTemplateSync("init/functions/dart/pubspec.yaml");
const MAIN_TEMPLATE = readTemplateSync("init/functions/dart/server.dart");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/dart/_gitignore");

/**
 * Create a Dart Firebase Functions project.
 */
export async function setup(setup: any, config: Config): Promise<void> {
  await config.askWriteProjectFile(`${setup.functions.source}/pubspec.yaml`, PUBSPEC_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/bin/server.dart`, MAIN_TEMPLATE);

  // Write the latest supported runtime version to the config.
  config.set("functions.runtime", latest("dart"));
  // Add dart specific ignores to config.
  config.set("functions.ignore", [".dart_tool", "build"]);

  const install = await confirm({
    message: "Do you want to install dependencies now?",
    default: true,
  });
  if (install) {
    const installProcess = spawn("dart", ["pub", "get"], {
      cwd: config.path(setup.functions.source),
      stdio: ["inherit", "inherit", "inherit"],
    });
    await new Promise((resolve, reject) => {
      installProcess.on("exit", resolve);
      installProcess.on("error", reject);
    });
  }
}
