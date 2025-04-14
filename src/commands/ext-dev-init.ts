import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { Config } from "../config";
import { FirebaseError, getErrMsg, getError } from "../error";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import * as npmDependencies from "../init/features/functions/npm-dependencies";
import { readTemplateSync } from "../templates";
marked.use(markedTerminal() as any);

function readCommonTemplates() {
  return {
    integrationTestFirebaseJsonTemplate: readTemplateSync("extensions/integration-test.json"),
    integrationTestEnvTemplate: readTemplateSync("extensions/integration-test.env"),
    extSpecTemplate: readTemplateSync("extensions/extension.yaml"),
    preinstallTemplate: readTemplateSync("extensions/PREINSTALL.md"),
    postinstallTemplate: readTemplateSync("extensions/POSTINSTALL.md"),
    changelogTemplate: readTemplateSync("extensions/CL-template.md"),
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
      let welcome: string;
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
          welcome = readTemplateSync("extensions/javascript/WELCOME.md");
          break;
        }
        case "typescript": {
          await typescriptSelected(config);
          welcome = readTemplateSync("extensions/typescript/WELCOME.md");
          break;
        }
        default: {
          throw new FirebaseError(`${lang} is not supported.`);
        }
      }

      await npmDependencies.askInstallDependencies({ source: "functions" }, config);

      return logger.info("\n" + marked(welcome));
    } catch (err: unknown) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(
          `Error occurred when initializing files for new extension: ${getErrMsg(err)}`,
          {
            original: getError(err),
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
  const packageLintingTemplate = readTemplateSync("extensions/typescript/package.lint.json");
  const packageNoLintingTemplate = readTemplateSync("extensions/typescript/package.nolint.json");
  const tsconfigTemplate = readTemplateSync("extensions/typescript/tsconfig.json");
  const tsconfigDevTemplate = readTemplateSync("extensions/typescript/tsconfig.dev.json");
  const indexTemplate = readTemplateSync("extensions/typescript/index.ts");
  const integrationTestTemplate = readTemplateSync("extensions/typescript/integration-test.ts");
  const gitignoreTemplate = readTemplateSync("extensions/typescript/_gitignore");
  const mocharcTemplate = readTemplateSync("extensions/typescript/_mocharc");
  const eslintTemplate = readTemplateSync("init/functions/typescript/_eslintrc");

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
  const indexTemplate = readTemplateSync("extensions/javascript/index.js");
  const integrationTestTemplate = readTemplateSync("extensions/javascript/integration-test.js");
  const packageLintingTemplate = readTemplateSync("extensions/javascript/package.lint.json");
  const packageNoLintingTemplate = readTemplateSync("extensions/javascript/package.nolint.json");
  const gitignoreTemplate = readTemplateSync("extensions/javascript/_gitignore");
  const eslintTemplate = readTemplateSync("init/functions/javascript/_eslintrc");

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
