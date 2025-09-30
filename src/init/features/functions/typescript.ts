import { askInstallDependencies } from "./npm-dependencies";
import { confirm } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/typescript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/typescript/_eslintrc");
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const TSCONFIG_DEV_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.dev.json");
const INDEX_TEMPLATE = readTemplateSync("init/functions/typescript/index.ts");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");

interface SetupOptions {
  force?: boolean;
}

export async function setup(setup: any, config: any, options: SetupOptions = {}): Promise<any> {
  if (setup.functions.lint === undefined) {
    setup.functions.lint = await confirm({
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: false,
    });
  }

  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  cbconfig.predeploy = [];
  if (setup.functions.lint) {
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run lint');
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
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
    // TODO: isn't this file out of date now?
    await config.askWriteProjectFile(
      `${setup.functions.source}/tsconfig.dev.json`,
      TSCONFIG_DEV_TEMPLATE,
      options.force,
    );
  } else {
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
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
    `${setup.functions.source}/tsconfig.json`,
    TSCONFIG_TEMPLATE,
    options.force,
  );

  await config.askWriteProjectFile(
    `${setup.functions.source}/src/index.ts`,
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
