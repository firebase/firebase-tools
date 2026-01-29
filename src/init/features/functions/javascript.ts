import { askInstallDependencies } from "./npm-dependencies";
import { templateWithSubbedResolverId } from "./utils";
import { confirm } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";
import * as supported from "../../../deploy/functions/runtimes/supported";

const INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index.js");
const GRAPH_INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index-ongraphrequest.js");
const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/javascript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package.nolint.json",
);
const PACKAGE_GRAPH_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package-ongraphrequest.lint.json",
);
const PACKAGE_GRAPH_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package-ongraphrequest.nolint.json",
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
    await config.askWriteProjectFile(`${setup.functions.source}/.eslintrc.js`, ESLINT_TEMPLATE);
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

  if (setup.featureInfo?.dataconnectResolver) {
    await config.askWriteProjectFile(
      `${setup.functions.source}/index.js`,
      templateWithSubbedResolverId(setup.featureInfo.dataconnectResolver.id, GRAPH_INDEX_TEMPLATE),
    );
  } else {
    await config.askWriteProjectFile(`${setup.functions.source}/index.js`, INDEX_TEMPLATE);
  }

  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await askInstallDependencies(setup.functions, config);
}
