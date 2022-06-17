import * as _ from "lodash";
import * as fs from "fs";
import * as path from "path";

import { askInstallDependencies } from "./npm-dependencies";
import { prompt } from "../../../prompt";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/typescript/");
const PACKAGE_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.lint.json"),
  "utf8"
);
const PACKAGE_NO_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.nolint.json"),
  "utf8"
);
const ESLINT_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_eslintrc"), "utf8");
const TSCONFIG_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "tsconfig.json"), "utf8");
const TSCONFIG_DEV_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "tsconfig.dev.json"),
  "utf8"
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
      if (setup.functions.lint) {
        _.set(setup, "config.functions.predeploy", [
          'npm --prefix "$RESOURCE_DIR" run lint',
          'npm --prefix "$RESOURCE_DIR" run build',
        ]);
        return config
          .askWriteProjectFile("functions/package.json", PACKAGE_LINTING_TEMPLATE)
          .then(() => {
            return config.askWriteProjectFile("functions/.eslintrc.js", ESLINT_TEMPLATE);
          });
      }
      _.set(setup, "config.functions.predeploy", 'npm --prefix "$RESOURCE_DIR" run build');
      return config.askWriteProjectFile("functions/package.json", PACKAGE_NO_LINTING_TEMPLATE);
    })
    .then(() => {
      return config.askWriteProjectFile("functions/tsconfig.json", TSCONFIG_TEMPLATE);
    })
    .then(() => {
      if (setup.functions.lint) {
        return config.askWriteProjectFile("functions/tsconfig.dev.json", TSCONFIG_DEV_TEMPLATE);
      }
    })
    .then(() => {
      return config.askWriteProjectFile("functions/src/index.ts", INDEX_TEMPLATE);
    })
    .then(() => {
      return config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
    })
    .then(() => {
      return askInstallDependencies(setup.functions, config);
    });
}
