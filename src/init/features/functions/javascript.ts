import { askInstallDependencies } from "./npm-dependencies";
import { confirm } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index.js");
const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/javascript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/javascript/_eslintrc");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/javascript/_gitignore");

interface SetupOptions {
  force?: boolean;
}

export async function setup(setup: any, config: any, options: SetupOptions = {}): Promise<any> {
  if (setup.functions.lint === undefined) {
    setup.functions.lint = await confirm(
      "Do you want to use ESLint to catch probable bugs and enforce style?",
    );
  }
  if (setup.functions.lint) {
    const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
    cbconfig.predeploy = ['npm --prefix "$RESOURCE_DIR" run lint'];
    await config.askWriteProjectFile(
      `${setup.functions.source}/package.json`,
      PACKAGE_LINTING_TEMPLATE.replace(
        "{{RUNTIME}}",
        supported.latest("nodejs").replace("nodejs", ""),
      ),
      options.force,
    );
    await config.askWriteProjectFile(
      `${setup.functions.source}/.eslintrc.js`,
      ESLINT_TEMPLATE,
      options.force,
    );
  } else {
    await config.askWriteProjectFile(
      `${setup.functions.source}/package.json`,
      PACKAGE_NO_LINTING_TEMPLATE.replace(
        "{{RUNTIME}}",
        supported.latest("nodejs").replace("nodejs", ""),
      ),
      options.force,
    );
  }

  await config.askWriteProjectFile(
    `${setup.functions.source}/index.js`,
    INDEX_TEMPLATE,
    options.force,
  );
  await config.askWriteProjectFile(
    `${setup.functions.source}/.gitignore`,
    GITIGNORE_TEMPLATE,
    options.force,
  );
  await askInstallDependencies(setup.functions, config);
}
