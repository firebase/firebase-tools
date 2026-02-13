import { askInstallDependencies } from "./npm-dependencies";
import { templateWithSubbedResolverId } from "./utils";
import { confirm } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/typescript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const PACKAGE_GRAPH_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package-ongraphrequest.lint.json",
);
const PACKAGE_GRAPH_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package-ongraphrequest.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/typescript/_eslintrc");
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const TSCONFIG_DEV_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.dev.json");
const INDEX_TEMPLATE = readTemplateSync("init/functions/typescript/index.ts");
const GRAPH_INDEX_TEMPLATE = readTemplateSync("init/functions/typescript/index-ongraphrequest.ts");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");

export async function setup(setup: any, config: any): Promise<any> {
  setup.functions.lint =
    setup.functions.lint ||
    (await confirm({
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: true,
    }));

  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  cbconfig.predeploy = [];
  if (setup.functions.lint) {
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run lint');
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
    await config.askWriteProjectFile(`${setup.functions.source}/.eslintrc.js`, ESLINT_TEMPLATE);
    // TODO: isn't this file out of date now?
    await config.askWriteProjectFile(
      `${setup.functions.source}/tsconfig.dev.json`,
      TSCONFIG_DEV_TEMPLATE,
    );
  } else {
    cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
  }

  let packageTemplate = PACKAGE_LINTING_TEMPLATE;
  if (setup.featureInfo?.dataconnectResolver) {
    packageTemplate = setup.functions.lint
      ? PACKAGE_GRAPH_LINTING_TEMPLATE
      : PACKAGE_GRAPH_NO_LINTING_TEMPLATE;
  } else if (!setup.functions.lint) {
    packageTemplate = PACKAGE_NO_LINTING_TEMPLATE;
  }
  await config.askWriteProjectFile(
    `${setup.functions.source}/package.json`,
    packageTemplate.replace("{{RUNTIME}}", supported.latest("nodejs").replace("nodejs", "")),
  );

  await config.askWriteProjectFile(`${setup.functions.source}/tsconfig.json`, TSCONFIG_TEMPLATE);
  if (setup.featureInfo?.dataconnectResolver) {
    await config.askWriteProjectFile(
      `${setup.functions.source}/src/index.ts`,
      templateWithSubbedResolverId(setup.featureInfo.dataconnectResolver.id, GRAPH_INDEX_TEMPLATE),
    );
  } else {
    await config.askWriteProjectFile(`${setup.functions.source}/src/index.ts`, INDEX_TEMPLATE);
  }
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await askInstallDependencies(setup.functions, config);
}
