import * as fs from "fs";
import * as path from "path";

import { askInstallDependencies } from "./npm-dependencies";
import { prompt } from "../../../prompt";
import { configForCodebase } from "../../../functions/projectConfig";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/typescript/");
const PACKAGE_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.lint.json"),
  "utf8",
);
const PACKAGE_NO_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.nolint.json"),
  "utf8",
);
const ESLINT_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_eslintrc"), "utf8");
const TSCONFIG_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "tsconfig.json"), "utf8");
const TSCONFIG_DEV_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "tsconfig.dev.json"),
  "utf8",
);
const INDEX_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "index.ts"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

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
