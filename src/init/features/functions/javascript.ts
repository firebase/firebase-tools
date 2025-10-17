import { askInstallDependencies } from "./npm-dependencies";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index.js");
const PACKAGE_TEMPLATE = readTemplateSync("init/functions/javascript/package.json");
const BIOME_TEMPLATE = readTemplateSync("init/functions/javascript/biome.json");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/javascript/_gitignore");

export async function setup(setup: any, config: any): Promise<any> {
  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  cbconfig.predeploy = [];

  const runtime = supported.latest("nodejs").replace("nodejs", "");
  await config.askWriteProjectFile(
    `${setup.functions.source}/package.json`,
    PACKAGE_TEMPLATE.replace("{{RUNTIME}}", runtime),
  );
  await config.askWriteProjectFile(`${setup.functions.source}/biome.json`, BIOME_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/index.js`, INDEX_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await askInstallDependencies(setup.functions, config);
}
