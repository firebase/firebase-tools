import * as clc from "cli-color";
import * as fs from "fs";

import { Client } from "../../../apiv2";
import { initGitHub } from "./github";
import { prompt } from "../../../prompt";
import { logger } from "../../../logger";
import { discover, WebFramework } from "../../../frameworks";
import { previews } from "../../../previews";
import { execSync } from "child_process";
import { sync as rimraf } from "rimraf";

const INDEX_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/index.html",
  "utf8"
);
const MISSING_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/404.html",
  "utf8"
);
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

export async function doSetup(setup: any, config: any): Promise<void> {
  setup.hosting = {};

  logger.info();
  logger.info(
    `Your ${clc.bold("public")} directory is the folder (relative to your project directory) that`
  );
  logger.info(
    `will contain Hosting assets to be uploaded with ${clc.bold("firebase deploy")}. If you`
  );
  logger.info("have a build process for your assets, use your build's output directory.");
  logger.info();

  if (previews.frameworkawareness) {
    await prompt(setup.hosting, [
      {
        name: "useWebFrameworks",
        type: "confirm",
        default: false,
        message: `Do you want to use a web framework?`,
      },
    ]);
  }

  if (setup.hosting.useWebFrameworks) {

    await prompt(setup.hosting, [
      {
        name: "source",
        type: "input",
        default: "hosting",
        message: "What do you want to use as your source directory?",
      },
    ]);

    const discoveredFramework = await discover(setup.hosting.source);
    if (discoveredFramework) {

      await prompt(setup.hosting, [
        {
          name: "overwriteDiscoveredFramework",
          type: "confirm",
          default: false,
          message: `Detected an existing ${discoveredFramework.framework} codebase in ${setup.hosting.source}, should we overwrite this directory?`,
        },
      ]);

      if (!setup.hosting.overwriteDiscoveredFramework) {
        setup.hosting.webFramework = discoveredFramework.framework;
      }

    }

    if (!discoveredFramework || setup.hosting.overwriteDiscoveredFramework) {
      await prompt(setup.hosting, [
        {
          name: "webFramework",
          type: "list",
          message: "Please choose the platform of the app:",
          default: discoveredFramework?.framework,
          choices: [
            { name: "Angular", value: WebFramework.Angular },
            { name: "Next.js", value: WebFramework.NextJS },
            { name: "Nuxt", value: WebFramework.Nuxt },
          ],
        },
      ]);

      if (setup.hosting.overwriteDiscoveredFramework) rimraf(setup.hosting.source);

      if (setup.hosting.webFramework === WebFramework.Angular) {
        execSync(`npx --yes -p @angular/cli ng new ${setup.hosting.source} --skip-git`, {stdio: 'inherit'})
        await prompt(setup.hosting, [
          {
            name: "useAngularUniversal",
            type: "confirm",
            default: false,
            message: `Would you like to setup Angular Universal?`,
          },
        ]);
        if (setup.hosting.useAngularUniversal) {
          execSync('ng add @nguniversal/express-engine --skip-confirmation', {stdio: 'inherit', cwd: setup.hosting.source });
        }
      };
      if (setup.hosting.webFramework === WebFramework.NextJS) execSync(`npx --yes create-next-app ${setup.hosting.source}`, {stdio: 'inherit'});
      if (setup.hosting.webFramework === WebFramework.Nuxt) {
        execSync(`npx --yes nuxi init ${setup.hosting.source}`, {stdio: 'inherit'});
        execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
      }
    }

    setup.config.hosting = {
      source: setup.hosting.source,
      // TODO swap out for framework ignores
      ignore: DEFAULT_IGNORES,
    };

  } else {

    await prompt(setup.hosting, [
      {
        name: "public",
        type: "input",
        default: "public",
        message: "What do you want to use as your public directory?",
      },
    ]);

    await prompt(setup.hosting, [
      {
        name: "spa",
        type: "confirm",
        default: false,
        message: "Configure as a single-page app (rewrite all urls to /index.html)?",
      },
    ]);

    setup.config.hosting = {
      public: setup.hosting.public,
      ignore: DEFAULT_IGNORES,
    };

  }

  await prompt(setup.hosting, [
    {
      name: "github",
      type: "confirm",
      default: false,
      message: "Set up automatic builds and deploys with GitHub?",
    },
  ]);

  if (!setup.hosting.useWebFrameworks) {

    if (setup.hosting.spa) {
      setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
    } else {
      // SPA doesn't need a 404 page since everything is index.html
      await config.askWriteProjectFile(`${setup.hosting.public}/404.html`, MISSING_TEMPLATE);
    }

    const c = new Client({ urlPrefix: "https://www.gstatic.com", auth: false });
    const response = await c.get<{ current: { version: string } }>("/firebasejs/releases.json");
    await config.askWriteProjectFile(
      `${setup.hosting.public}/index.html`,
      INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version)
    );

  }

  if (setup.hosting.github) {
    return initGitHub(setup);
  }
}
