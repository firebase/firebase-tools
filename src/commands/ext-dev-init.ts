import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

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
    integrationTestFirebaseJsonTemplate: fs.readFileSync(
      path.join(TEMPLATE_ROOT, "integration-test.json"),
      "utf8",
    ),
    integrationTestEnvTemplate: fs.readFileSync(
      path.join(TEMPLATE_ROOT, "integration-test.env"),
      "utf8",
    ),
    extSpecTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "extension.yaml"), "utf8"),
    preinstallTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "PREINSTALL.md"), "utf8"),
    postinstallTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "POSTINSTALL.md"), "utf8"),
    changelogTemplate: fs.readFileSync(path.join(TEMPLATE_ROOT, "CL-template.md"), "utf8"),
  };
}

/**
 * Command for setting up boilerplate code for a new extension.
 */
export const command = new Command("ext:dev:init")
  .description("initialize files for writing an extension in the current directory")
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (options: any) => {
    const cwd = options.cwd || process.cwd();
    const config = new Config({}, { projectDir: cwd, cwd: cwd });

    try {
      const lang = await promptOnce({
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
          await javascriptSelected(config);
          break;
        }
        case "typescript": {
          await typescriptSelected(config);
          break;
        }
        default: {
          throw new FirebaseError(`${lang} is not supported.`);
        }
      }

      await npmDependencies.askInstallDependencies({ source: "functions" }, config);

      const welcome = fs.readFileSync(path.join(TEMPLATE_ROOT, lang, "WELCOME.md"), "utf8");
      return logger.info("\n" + marked(welcome));
    } catch (err: any) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(
          `Error occurred when initializing files for new extension: ${err.message}`,
          {
            original: err,
          },
        );
      }
      throw err;
    }
  });

/**
 * Sets up Typescript boilerplate code for new extension
 * @param {Config} config configuration options
 */
async function typescriptSelected(config: Config): Promise<void> {
  const packageLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "package.lint.json"),
    "utf8",
  );
  const packageNoLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "package.nolint.json"),
    "utf8",
  );
  const tsconfigTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "tsconfig.json"),
    "utf8",
  );
  const tsconfigDevTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "tsconfig.dev.json"),
    "utf8",
  );
  const indexTemplate = fs.readFileSync(path.join(TEMPLATE_ROOT, "typescript", "index.ts"), "utf8");
  const integrationTestTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "integration-test.ts"),
    "utf8",
  );
  const gitignoreTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "_gitignore"),
    "utf8",
  );
  const mocharcTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "typescript", "_mocharc"),
    "utf8",
  );
  const eslintTemplate = fs.readFileSync(
    path.join(FUNCTIONS_ROOT, "typescript", "_eslintrc"),
    "utf8",
  );

  const lint = await promptOnce({
    name: "lint",
    type: "confirm",
    message: "Do you want to use ESLint to catch probable bugs and enforce style?",
    default: true,
  });
  const templates = readCommonTemplates();
  await config.askWriteProjectFile("extension.yaml", templates.extSpecTemplate);
  await config.askWriteProjectFile("PREINSTALL.md", templates.preinstallTemplate);
  await config.askWriteProjectFile("POSTINSTALL.md", templates.postinstallTemplate);
  await config.askWriteProjectFile("CHANGELOG.md", templates.changelogTemplate);
  await config.askWriteProjectFile("functions/.mocharc.json", mocharcTemplate);
  await config.askWriteProjectFile("functions/src/index.ts", indexTemplate);
  await config.askWriteProjectFile(
    "functions/integration-tests/integration-test.spec.ts",
    integrationTestTemplate,
  );
  await config.askWriteProjectFile(
    "functions/integration-tests/firebase.json",
    templates.integrationTestFirebaseJsonTemplate,
  );
  await config.askWriteProjectFile(
    "functions/integration-tests/extensions/greet-the-world.env",
    templates.integrationTestEnvTemplate,
  );
  if (lint) {
    await config.askWriteProjectFile("functions/package.json", packageLintingTemplate);
    await config.askWriteProjectFile("functions/.eslintrc.js", eslintTemplate);
  } else {
    await config.askWriteProjectFile("functions/package.json", packageNoLintingTemplate);
  }
  await config.askWriteProjectFile("functions/tsconfig.json", tsconfigTemplate);
  if (lint) {
    await config.askWriteProjectFile("functions/tsconfig.dev.json", tsconfigDevTemplate);
  }
  await config.askWriteProjectFile("functions/.gitignore", gitignoreTemplate);
}

/**
 * Sets up Javascript boilerplate code for new extension
 * @param {Config} config configuration options
 */
async function javascriptSelected(config: Config): Promise<void> {
  const indexTemplate = fs.readFileSync(path.join(TEMPLATE_ROOT, "javascript", "index.js"), "utf8");
  const integrationTestTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "integration-test.js"),
    "utf8",
  );
  const packageLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "package.lint.json"),
    "utf8",
  );
  const packageNoLintingTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "package.nolint.json"),
    "utf8",
  );
  const gitignoreTemplate = fs.readFileSync(
    path.join(TEMPLATE_ROOT, "javascript", "_gitignore"),
    "utf8",
  );
  const eslintTemplate = fs.readFileSync(
    path.join(FUNCTIONS_ROOT, "javascript", "_eslintrc"),
    "utf8",
  );

  const lint = await promptOnce({
    name: "lint",
    type: "confirm",
    message: "Do you want to use ESLint to catch probable bugs and enforce style?",
    default: false,
  });

  const templates = readCommonTemplates();
  await config.askWriteProjectFile("extension.yaml", templates.extSpecTemplate);
  await config.askWriteProjectFile("PREINSTALL.md", templates.preinstallTemplate);
  await config.askWriteProjectFile("POSTINSTALL.md", templates.postinstallTemplate);
  await config.askWriteProjectFile("CHANGELOG.md", templates.changelogTemplate);
  await config.askWriteProjectFile("functions/index.js", indexTemplate);
  await config.askWriteProjectFile(
    "functions/integration-tests/integration-test.spec.js",
    integrationTestTemplate,
  );
  await config.askWriteProjectFile(
    "functions/integration-tests/firebase.json",
    templates.integrationTestFirebaseJsonTemplate,
  );
  await config.askWriteProjectFile(
    "functions/integration-tests/extensions/greet-the-world.env",
    templates.integrationTestEnvTemplate,
  );
  if (lint) {
    await config.askWriteProjectFile("functions/package.json", packageLintingTemplate);
    await config.askWriteProjectFile("functions/.eslintrc.js", eslintTemplate);
  } else {
    await config.askWriteProjectFile("functions/package.json", packageNoLintingTemplate);
  }
  await config.askWriteProjectFile("functions/.gitignore", gitignoreTemplate);
}
