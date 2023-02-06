import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import * as npmDependencies from "../init/features/functions/npm-dependencies";
marked.setOptions({
  renderer: new TerminalRenderer(),
});

const TEMPLATE_ROOT = path.resolve(__dirname, "../../templates/extensions/");
const FUNCTIONS_ROOT = path.resolve(__dirname, "../../templates/init/functions/");

function readCommonTemplates() {
  return {
    extSpecTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "extension.yaml"), "utf8"),
    preinstallTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "PREINSTALL.md"), "utf8"),
    postinstallTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "POSTINSTALL.md"), "utf8"),
    changelogTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "CHANGELOG.md"), "utf8"),
  };
}

/**
 * Command for setting up boilerplate code for a new extension.
 */
export const command = new Command("ext:dev:init")
  .description("initialize files for writing an extension in the current directory")
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .withForce()
  .option(
    "--language <language>",
    "In which language do you want to write the Cloud Functions for your extension?"
  )
  .option("--eslint", "Do you want to enable esLint?")
  .option("-install-deps", "Do you want to install dependencies now?")
  .action(async (options: any) => {
    const cwd = options.cwd || process.cwd();
    const config = new Config({}, { projectDir: cwd, cwd: cwd });
    options.npm = options.installDeps;
    try {
      const lang =
        options.language ??
        await promptOnce({
        type: "list",
        name: "language",
        message: "In which language do you want to write the Cloud Functions for your extension?",
        default: "javascript",
        choices: [
          {
            name: "JavaScript",
            value: "javascript",
          },
          {
            name: "TypeScript",
            value: "typescript",
          },
        ],
      });
      switch (lang) {
        case "javascript": {
          await javascriptSelected(config, options);
          break;
        }
        case "typescript": {
          await typescriptSelected(config, options);
          break;
        }
        default: {
          throw new FirebaseError(`${lang} is not supported.`);
        }
      }

      await npmDependencies.askInstallDependencies(options, config);

      const welcome = fs.readFileSync(path.join(TEMPLATE_ROOT, lang, "WELCOME.md"), "utf8");
      return logger.info("\n" + marked(welcome));
    } catch (err: any) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(
          `Error occurred when initializing files for new extension: ${err.message}`,
          {
            original: err,
          }
        );
      }
      throw err;
    }
  });

/**
 * Sets up Typescript boilerplate code for new extension
 * @param {Config} config configuration options
 */
async function typescriptSelected(config: Config, options: any): Promise<void> {
  const packageLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "package.lint.json"),
    "utf8"
  );
  const packageNoLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "package.nolint.json"),
    "utf8"
  );
  const tsconfigTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "tsconfig.json"),
    "utf8"
  );
  const tsconfigDevTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "tsconfig.dev.json"),
    "utf8"
  );
  const indexTemplate = fs.readFileSync(path.join(TEMPLATE_ROOT, "typescript", "index.ts"), "utf8");
  const gitignoreTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "_gitignore"),
    "utf8"
  );
  const eslintTemplate = fs.readFileSync(
    path.join(FUNCTIONS_ROOT, "typescript", "_eslintrc"),
    "utf8"
  );

  const lint = options.eslint == "true" ?? await promptOnce({
    name: "lint",
    type: "confirm",
    message: "Do you want to use ESLint to catch probable bugs and enforce style?",
    default: true,
  });
  const templates = readCommonTemplates();
  await config.askWriteProjectFile("extension.yaml", templates.extSpecTemplate, options.force);
  await config.askWriteProjectFile("PREINSTALL.md", templates.preinstallTemplate, options.force);
  await config.askWriteProjectFile("POSTINSTALL.md", templates.postinstallTemplate, options.force);
  await config.askWriteProjectFile("CHANGELOG.md", templates.changelogTemplate, options.force);
  await config.askWriteProjectFile("functions/src/index.ts", indexTemplate, options.force);
  if (lint) {
    await config.askWriteProjectFile("functions/package.json", packageLintingTemplate, options.force);
    await config.askWriteProjectFile("functions/.eslintrc.js", eslintTemplate, options.force);
  } else {
    await config.askWriteProjectFile("functions/package.json", packageNoLintingTemplate, options.force);
  }
  await config.askWriteProjectFile("functions/tsconfig.json", tsconfigTemplate, options.force);
  if (lint) {
    await config.askWriteProjectFile("functions/tsconfig.dev.json", tsconfigDevTemplate, options.force);
  }
  await config.askWriteProjectFile("functions/.gitignore", gitignoreTemplate, options.force);
}

/**
 * Sets up Javascript boilerplate code for new extension
 * @param {Config} config configuration options
 */
async function javascriptSelected(config: Config, options: any): Promise<void> {
  const indexTemplate = fs.readFileSync(path.join(TEMPLATE_ROOT, "javascript", "index.js"), "utf8");
  const packageLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "package.lint.json"),
    "utf8"
  );
  const packageNoLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "package.nolint.json"),
    "utf8"
  );
  const gitignoreTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "_gitignore"),
    "utf8"
  );
  const eslintTemplate = fs.readFileSync(
    path.join(FUNCTIONS_ROOT, "javascript", "_eslintrc"),
    "utf8"
  );
  
  const lint = options.eslint ?? await promptOnce({
    name: "lint",
    type: "confirm",
    message: "Do you want to use ESLint to catch probable bugs and enforce style?",
    default: false,
  });

  const templates = readCommonTemplates();
  await config.askWriteProjectFile("extension.yaml", templates.extSpecTemplate, options.force);
  await config.askWriteProjectFile("PREINSTALL.md", templates.preinstallTemplate, options.force);
  await config.askWriteProjectFile("POSTINSTALL.md", templates.postinstallTemplate, options.force);
  await config.askWriteProjectFile("CHANGELOG.md", templates.changelogTemplate, options.force);
  await config.askWriteProjectFile("functions/index.js", indexTemplate, options.force);
  if (lint) {
    await config.askWriteProjectFile("functions/package.json", packageLintingTemplate, options.force);
    await config.askWriteProjectFile("functions/.eslintrc.js", eslintTemplate, options.force);
  } else {
    await config.askWriteProjectFile("functions/package.json", packageNoLintingTemplate, options.force);
  }
  await config.askWriteProjectFile("functions/.gitignore", gitignoreTemplate, options.force);
}
