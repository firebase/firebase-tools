import { askInstallDependencies } from "./npm-dependencies";
import { prompt } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";
import { readTemplateSync } from "../../../templates";

const PACKAGE_LINTING_TEMPLATE = readTemplateSync("init/functions/typescript/package.lint.json");
const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const ESLINT_TEMPLATE = readTemplateSync("init/functions/typescript/_eslintrc");
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const TSCONFIG_DEV_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.dev.json");
const INDEX_TEMPLATE = readTemplateSync("init/functions/typescript/index.ts");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");

export function setup(setup: any, config: any): Promise<any> {
  return prompt(setup.functions, [
    {
      name: "lint",
      type: "confirm",
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: true,
    },
  ])
    .then(() => {
      const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
      cbconfig.predeploy = [];
      if (setup.functions.lint) {
        cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run lint');
        cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
        return config
          .askWriteProjectFile(`${setup.functions.source}/package.json`, PACKAGE_LINTING_TEMPLATE)
          .then(() => {
            return config.askWriteProjectFile(
              `${setup.functions.source}/.eslintrc.js`,
              ESLINT_TEMPLATE,
            );
          });
      } else {
        cbconfig.predeploy.push('npm --prefix "$RESOURCE_DIR" run build');
      }
      return config.askWriteProjectFile(
        `${setup.functions.source}/package.json`,
        PACKAGE_NO_LINTING_TEMPLATE,
      );
    })
    .then(() => {
      return config.askWriteProjectFile(
        `${setup.functions.source}/tsconfig.json`,
        TSCONFIG_TEMPLATE,
      );
    })
    .then(() => {
      if (setup.functions.lint) {
        return config.askWriteProjectFile(
          `${setup.functions.source}/tsconfig.dev.json`,
          TSCONFIG_DEV_TEMPLATE,
        );
      }
    })
    .then(() => {
      return config.askWriteProjectFile(`${setup.functions.source}/src/index.ts`, INDEX_TEMPLATE);
    })
    .then(() => {
      return config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
    })
    .then(() => {
      return askInstallDependencies(setup.functions, config);
    });
}
