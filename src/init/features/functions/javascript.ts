import { askInstallDependencies } from "./npm-dependencies";
import { confirm } from "../../../promptV2";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";

const INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index.js");
const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/javascript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/javascript/_eslintrc");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/javascript/_gitignore");

export async function setup(setup: any, config: any): Promise<any> {
  setup.functions.lint =
    setup.functions.lint ||
    (await confirm("Do you want to use ESLint to catch probable bugs and enforce style?"));
  if (setup.functions.lint) {
    const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
    cbconfig.predeploy = ['npm --prefix "$RESOURCE_DIR" run lint'];
    await config.askWriteProjectFile(
      `${setup.functions.source}/package.json`,
      PACKAGE_LINTING_TEMPLATE,
    );
    await config.askWriteProjectFile(`${setup.functions.source}/.eslintrc.js`, ESLINT_TEMPLATE);
  } else {
    await config.askWriteProjectFile(
      `${setup.functions.source}/package.json`,
      PACKAGE_NO_LINTING_TEMPLATE,
    );
  }

  await config.askWriteProjectFile(`${setup.functions.source}/index.js`, INDEX_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await askInstallDependencies(setup.functions, config);
}
