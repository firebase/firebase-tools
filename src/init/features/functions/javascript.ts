import { askInstallDependencies } from "./npm-dependencies";
import { prompt } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";

const INDEX_TEMPLATE = readTemplateSync("init/functions/javascript/index.js");
const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/javascript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/javascript/package.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/javascript/_eslintrc");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/javascript/_gitignore");

export function setup(setup: any, config: any): Promise<any> {
  return prompt(setup.functions, [
    {
      name: "lint",
      type: "confirm",
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: false,
    },
  ])
    .then(() => {
      if (setup.functions.lint) {
        const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
        cbconfig.predeploy = ['npm --prefix "$RESOURCE_DIR" run lint'];
        return config
          .askWriteProjectFile(`${setup.functions.source}/package.json`, PACKAGE_LINTING_TEMPLATE)
          .then(() => {
            config.askWriteProjectFile(`${setup.functions.source}/.eslintrc.js`, ESLINT_TEMPLATE);
          });
      }
      return config.askWriteProjectFile(
        `${setup.functions.source}/package.json`,
        PACKAGE_NO_LINTING_TEMPLATE,
      );
    })
    .then(() => {
      return config.askWriteProjectFile(`${setup.functions.source}/index.js`, INDEX_TEMPLATE);
    })
    .then(() => {
      return config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
    })
    .then(() => {
      return askInstallDependencies(setup.functions, config);
    });
}
