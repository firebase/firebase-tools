import { askInstallDependencies } from "./npm-dependencies";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const PACKAGE_TEMPLATE = readTemplateSync("init/functions/typescript/package.json");
const BIOME_TEMPLATE = readTemplateSync("init/functions/typescript/biome.json");
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const INDEX_TEMPLATE = readTemplateSync("init/functions/typescript/index.ts");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");

export async function setup(setup: any, config: any): Promise<any> {
  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  cbconfig.predeploy = [
    'npm --prefix "$RESOURCE_DIR" run lint',
    'npm --prefix "$RESOURCE_DIR" run build',
  ];

  const runtime = supported.latest("nodejs").replace("nodejs", "");
  await config.askWriteProjectFile(
    `${setup.functions.source}/package.json`,
    PACKAGE_TEMPLATE.replace("{{RUNTIME}}", runtime),
  );
  await config.askWriteProjectFile(`${setup.functions.source}/biome.json`, BIOME_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/tsconfig.json`, TSCONFIG_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/src/index.ts`, INDEX_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await askInstallDependencies(setup.functions, config);
}
